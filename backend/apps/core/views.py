from django.http import JsonResponse
from django.db import connection

def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        database = 'ok'
    except Exception:
        database = 'degraded'
    return JsonResponse({'status': 'ok', 'database': database, 'service': 'opshub-api'})

def process_metric_smart(metric_name, raw_value):
    """
    این تابع به صورت هوشمند متریک‌های خام پرومتئوس را تحلیل کرده و
    مقدار فرمت‌شده، درصد نوار گرافیکی و توضیحات استاندارد آن را بازمی‌گرداند.
    """
    try:
        val = float(raw_value)
    except (ValueError, TypeError):
        return str(raw_value), 20, "Metric / Trace"

    # ۱. پردازش متریک‌های مربوط به حافظه و دیسک (Bytes)
    if "bytes" in metric_name or "size" in metric_name:
        if val > (1024 ** 4): # ترابایت
            display_val = f"{val / (1024 ** 4):.2f} TB"
        elif val > (1024 ** 3): # گیگابایت
            display_val = f"{val / (1024 ** 3):.2f} GB"
        else:
            display_val = f"{val / (1024 ** 2):.1f} MB"
            
        # محاسبه درصد گرافیکی نوار:
        # برای حافظه در دسترس (Available)، هرچه بیشتر باشد بهتر است، پس نسبت معکوس یا مستقیم منطقی می‌گیریم
        if "MemAvailable" in metric_name:
            # فرض بر رم ۸ گیگابایتی سیستم میزبان
            percent = int((val / (8 * 1024 ** 3)) * 100)
            description = "MEMORY / available"
        elif "free" in metric_name:
            # فرض بر هارد ۲۵۶ گیگابایتی
            percent = int((val / (256 * 1024 ** 3)) * 100)
            description = "STORAGE / root"
        else:
            percent = 50
            description = "CAPACITY / raw bytes"
            
        return display_val, max(10, min(100, percent)), description

    # ۲. پردازش متریک‌های زمان و سی‌پی‌یو (Seconds / Time)
    elif "seconds" in metric_name or "time" in metric_name:
        if "cpu" in metric_name:
            # سی‌پی‌یو معمولاً تجمعی است، ما یک درصد متعادل بر اساس مقدار خام رندر می‌کنیم
            percent = int(val) % 100 if val > 0 else 0
            display_val = f"{val:.1f}s"
            description = "CPU / aggregate active time"
            return display_val, max(15, percent), description
        else:
            display_val = f"{val:.2f} s"
            return display_val, 40, "TIME / duration"

    # ۳. پردازش متریک‌های شبکه و ترافیک (Receive / Transmit)
    elif "network" in metric_name or "bytes_total" in metric_name:
        # تبدیل حجم شبکه به گیگابایت یا ترابایت برای نمایش
        if val > (1024 ** 4):
            display_val = f"{val / (1024 ** 4):.2f} TB"
        else:
            display_val = f"{val / (1024 ** 3):.2f} GB"
        
        description = "NETWORK / total received" if "receive" in metric_name else "NETWORK / traffic"
        return display_val, 35, description

    # ۴. متریک‌های شمارنده متفرقه (Counters)
    else:
        if val > 1_000_000:
            display_val = f"{val / 1_000_000:.1f}M"
        elif val > 1_000:
            display_val = f"{val / 1_000:.1f}K"
        else:
            display_val = str(int(val))
        return display_val, 60, "SYSTEM / counter total"

import json
from django.http import JsonResponse
from django.db import connection

def infrastructure_telemetry(request):
    """
    استخراج تلمتری پویا همراه با فیلترینگ انتخابی کاربر مستقیم از لایه فرانت‌اِند
    """
    try:
        # ۱. دریافت پارامتر فیلتر از فرانت‌اِند
        filtered_metrics_raw = request.GET.get('filtered_metrics', None)
        selected_metrics = []
        if filtered_metrics_raw:
            try:
                selected_metrics = json.loads(filtered_metrics_raw)
            except Exception:
                pass

        with connection.cursor() as cursor:
            # ۲. واکشی وضعیت کانتینرها
            cursor.execute("""
                SELECT DISTINCT ON (container_name) container_name, status, cpu_percent, mem_usage_mb
                FROM docker_metrics 
                ORDER BY container_name, id DESC;
            """)
            db_containers = cursor.fetchall()
            
            # ۳. واکشی وضعیت جنکینز
            cursor.execute("""
                SELECT job_name, build_number, result, duration_ms 
                FROM jenkins_builds 
                ORDER BY id DESC 
                LIMIT 4;
            """)
            db_builds = cursor.fetchall()
            
            # ۴. استخراج کاتالوگ کل نام تمام متریک‌های موجود در دیتابیس برای فرانت‌اِند
            cursor.execute("SELECT DISTINCT metric_name FROM prometheus_alerts ORDER BY metric_name;")
            all_available_metrics = [row[0] for row in cursor.fetchall()]

            # ۵. واکشی مقادیر متریک‌ها (اگر فیلتر انتخاب شده باشد، فقط همان‌ها را می‌خواند)
            if selected_metrics:
                placeholders = ", ".join(["%s"] * len(selected_metrics))
                query_sql = f"""
                    SELECT DISTINCT ON (metric_name) metric_name, value 
                    FROM prometheus_alerts 
                    WHERE metric_name IN ({placeholders})
                    ORDER BY metric_name, id DESC;
                """
                cursor.execute(query_sql, selected_metrics)
            else:
                # اگر فیلتری نبود به صورت پیش‌فرض خالی برمی‌گرداند یا ۴ تای اول
                cursor.execute("""
                    SELECT DISTINCT ON (metric_name) metric_name, value 
                    FROM prometheus_alerts 
                    ORDER BY metric_name, id DESC LIMIT 4;
                """)
            db_metrics = cursor.fetchall()

        # فرمت‌دهی دیتای کانتینرها و جنکینز
        containers_list = [[c[0], c[1], f"{c[2]:.1f}%", f"{c[3]:.1f} MB"] for c in db_containers]
        builds_list = []
        for job, num, res, duration in db_builds:
            dur_sec = int(duration / 1000) if duration else 0
            dur_str = f"{dur_sec // 60}m {dur_sec % 60}s" if dur_sec > 60 else f"{dur_sec}s"
            builds_list.append([job, f"#{num}", res if res else "PENDING", dur_str])

        # فرآوری پویای متریک‌های انتخابی کلاینت با لایه هوشمند واحدها
        core_metrics_list = []
        for metric_name, value in db_metrics:
            display_value, bar_percent, description = process_metric_smart(metric_name, value)
            core_metrics_list.append([metric_name, display_value, description, str(bar_percent)])

        # محاسبات وضعیت کارت‌ها
        total_containers = len(containers_list)
        running_containers = sum(1 for c in db_containers if c[1] == 'running')
        system_health_str = f"{(running_containers / total_containers) * 100:.1f}%" if total_containers > 0 else "0%"

        telemetry_data = {
            "metrics": {
                "system_health": system_health_str,
                "active_containers": str(running_containers),
                "pipelines_today": str(len(builds_list)),
                "telemetry_events": f"{total_containers + len(builds_list)} active nodes"
            },
            "containers": containers_list,
            "builds": builds_list,
            "core_metrics": core_metrics_list,
            "all_available_metrics": all_available_metrics # ارسال کل کاتالوگ کلمات کلیدی دیتابیس به فرانت
        }
        
        return JsonResponse(telemetry_data, status=200)

    except Exception as e:
        return JsonResponse({"detail": f"Filter runtime execution failed: {str(e)}"}, status=500)
