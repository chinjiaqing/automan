"""
ocr.py - OCR 文字识别（getWords / findStr）

模式：
  默认模式: stdin 接收 JSON，stdout 输出 JSON（一次性）
  --worker: 持久化工作进程，逐行读入 JSON 命令，逐行输出 JSON 结果

依赖: opencv-python, numpy, rapidocr-onnxruntime
"""

import sys
import json
import time
import base64
import numpy as np
import cv2
from rapidocr_onnxruntime import RapidOCR

# 全局 OCR 引擎（复用，避免重复加载模型）
_ocr_engine = None


def get_ocr():
    global _ocr_engine
    if _ocr_engine is None:
        _ocr_engine = RapidOCR(params={"Global.use_cls": False})
    return _ocr_engine


# ── 预设颜色（HSV 范围，OpenCV 色相 0-180） ────

COLOR_PRESETS = {
    "red": [(0, 50, 50), (10, 255, 255), (160, 50, 50), (180, 255, 255)],
    "orange": [(10, 50, 50), (25, 255, 255)],
    "yellow": [(25, 50, 50), (35, 255, 255)],
    "green": [(35, 50, 50), (85, 255, 255)],
    "cyan": [(85, 50, 50), (100, 255, 255)],
    "blue": [(100, 50, 50), (130, 255, 255)],
    "purple": [(130, 50, 50), (160, 255, 255)],
    "white": [(0, 0, 200), (180, 40, 255)],
    "black": [(0, 0, 0), (180, 255, 50)],
    "gray": [(0, 0, 50), (180, 40, 200)],
}


def decode_base64_image(b64_string: str) -> np.ndarray:
    """将 base64 字符串解码为 OpenCV 图像（BGR）"""
    if "," in b64_string:
        b64_string = b64_string.split(",", 1)[1]
    raw = base64.b64decode(b64_string)
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("无法解码图片")
    return img


def parse_color_to_bgr(color: str):
    """将颜色字符串解析为 BGR 元组。
    支持：
      - 预设名称 (red, blue, ...)
      - hex (#RRGGBB 或 #RGB)
      - rgb (r,g,b)
    """
    s = color.strip()
    # hex
    if s.startswith('#'):
        h = s.lstrip('#')
        if len(h) == 3:
            h = ''.join(c * 2 for c in h)
        if len(h) != 6:
            raise ValueError(f"无效的 hex 颜色: {color}")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        return (b, g, r)
    # rgb comma-separated
    parts = [p.strip() for p in s.split(',')]
    if len(parts) == 3:
        r, g, b = int(parts[0]), int(parts[1]), int(parts[2])
        return (b, g, r)
    raise ValueError(f"无法解析颜色: {color}")


def apply_color_filter(img: np.ndarray, color: str, color_tolerance: int = 50) -> np.ndarray:
    """按颜色过滤：保留指定颜色区域的像素，其余设为白色。
    color_tolerance: 0-100，默认 50。映射为 HSV 容差：色相 = tol*0.3，饱和度/明度 = tol*1.2。
    """
    color_lower = color.lower().strip()
    h_tol = max(1, int(color_tolerance * 0.3))
    sv_tol = max(1, int(color_tolerance * 1.2))

    # preset name
    if color_lower in COLOR_PRESETS:
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        ranges = COLOR_PRESETS[color_lower]
        # scale preset ranges by tolerance factor (default 50 => factor 1.0)
        factor = color_tolerance / 50.0
        if len(ranges) == 4:
            l1, u1, l2, u2 = ranges
            def scale_range(lo, hi):
                mid = [(lo[i] + hi[i]) / 2 for i in range(3)]
                half = [(hi[i] - lo[i]) / 2 * factor for i in range(3)]
                s_lo = [max(0 if i == 0 else 0, int(mid[i] - half[i])) for i in range(3)]
                s_hi = [min(180 if i == 0 else 255, int(mid[i] + half[i])) for i in range(3)]
                return tuple(s_lo), tuple(s_hi)
            sl1, sh1 = scale_range(l1, u1)
            sl2, sh2 = scale_range(l2, u2)
            mask1 = cv2.inRange(hsv, np.array(sl1), np.array(sh1))
            mask2 = cv2.inRange(hsv, np.array(sl2), np.array(sh2))
            mask = cv2.bitwise_or(mask1, mask2)
        else:
            lo, hi = ranges[0], ranges[1]
            mid = [(lo[i] + hi[i]) / 2 for i in range(3)]
            half = [(hi[i] - lo[i]) / 2 * factor for i in range(3)]
            s_lo = tuple(max(0, int(mid[i] - half[i])) for i in range(3))
            s_hi = tuple(min(180 if i == 0 else 255, int(mid[i] + half[i])) for i in range(3))
            mask = cv2.inRange(hsv, np.array(s_lo), np.array(s_hi))
    else:
        # arbitrary hex / rgb -> convert to HSV, build tolerance range
        bgr = parse_color_to_bgr(color)
        pixel = np.uint8([[list(bgr)]])
        hsv_pixel = cv2.cvtColor(pixel, cv2.COLOR_BGR2HSV)
        h, s, v = int(hsv_pixel[0][0][0]), int(hsv_pixel[0][0][1]), int(hsv_pixel[0][0][2])
        # tolerance derived from color_tolerance parameter
        lower = np.array([max(0, h - h_tol), max(0, s - sv_tol), max(0, v - sv_tol)])
        upper = np.array([min(180, h + h_tol), min(255, s + sv_tol), min(255, v + sv_tol)])
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, lower, upper)

    result = np.full_like(img, 255)
    result[mask > 0] = img[mask > 0]
    gray = cv2.cvtColor(result, cv2.COLOR_BGR2GRAY)
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def get_words(image_b64: str, region: list = None, color: str = None,
             color_tolerance: int = 50) -> dict:
    """OCR 文字识别"""
    t0 = time.perf_counter()
    src = decode_base64_image(image_b64)

    offset_x, offset_y = 0, 0
    if region and len(region) == 4:
        x1, y1, x2, y2 = region
        if x1 != 0 or y1 != 0 or x2 != 0 or y2 != 0:
            x1 = max(0, min(x1, src.shape[1]))
            y1 = max(0, min(y1, src.shape[0]))
            x2 = max(x1 + 1, min(x2, src.shape[1]))
            y2 = max(y1 + 1, min(y2, src.shape[0]))
            src = src[y1:y2, x1:x2]
            offset_x, offset_y = x1, y1

    if color:
        src = apply_color_filter(src, color, color_tolerance)

    ocr = get_ocr()
    result, elapse = ocr(src)

    words = []
    if result:
        for item in result:
            box, text, confidence = item
            xs = [p[0] for p in box]
            ys = [p[1] for p in box]
            bx = int(min(xs))
            by = int(min(ys))
            bw = int(max(xs) - bx)
            bh = int(max(ys) - by)
            words.append({
                "text": text,
                "x": bx + offset_x,
                "y": by + offset_y,
                "w": bw,
                "h": bh,
                "confidence": round(float(confidence), 4),
            })

    elapsed = round((time.perf_counter() - t0) * 1000, 1)
    return {"words": words, "elapsed": elapsed}


def levenshtein_ratio(s1: str, s2: str) -> float:
    """计算两个字符串的相似度（基于编辑距离），返回 0-1"""
    if not s1 and not s2:
        return 1.0
    m, n = len(s1), len(s2)
    dp = list(range(n + 1))
    for i in range(1, m + 1):
        prev = dp[0]
        dp[0] = i
        for j in range(1, n + 1):
            temp = dp[j]
            if s1[i - 1] == s2[j - 1]:
                dp[j] = prev
            else:
                dp[j] = 1 + min(prev, dp[j], dp[j - 1])
            prev = temp
    dist = dp[n]
    max_len = max(m, n)
    return 1.0 - dist / max_len if max_len > 0 else 0.0


def sliding_window_match(text: str, target: str) -> float:
    """滑动窗口匹配：在 text 中查找与 target 最相似的子串"""
    t_len = len(target)
    if t_len == 0:
        return 0.0
    if target in text:
        return 1.0
    best = 0.0
    for window_size in range(max(1, t_len - 1), min(len(text), t_len + 1) + 1):
        for i in range(len(text) - window_size + 1):
            substring = text[i:i + window_size]
            ratio = levenshtein_ratio(substring, target)
            if ratio > best:
                best = ratio
            if best >= 1.0:
                return best
    return best


def find_str(image_b64: str, target: str, region: list = None,
             similarity: float = 0.8, color: str = None,
             color_tolerance: int = 50) -> dict:
    """找字：在截图中查找指定文字"""
    ocr_result = get_words(image_b64, region, color, color_tolerance)
    all_words = ocr_result["words"]

    matches = []
    for word in all_words:
        text = word["text"]
        if target in text:
            matches.append({**word, "similarity": 1.0})
            continue
        sim = sliding_window_match(text, target)
        if sim >= similarity:
            matches.append({**word, "similarity": round(sim, 4)})

    matches.sort(key=lambda m: m["similarity"], reverse=True)
    return {
        "matches": matches,
        "allWords": [w["text"] for w in all_words],
        "elapsed": ocr_result["elapsed"],
    }


def handle_command(input_data: dict) -> dict:
    """处理单个命令"""
    action = input_data.get("action", "")
    image_b64 = input_data.get("image", "")
    region = input_data.get("region", [0, 0, 0, 0])
    color = input_data.get("color")
    color_tolerance = input_data.get("colorTolerance", 50)

    if not image_b64:
        return {"error": "image 为必填"}

    try:
        if action == "getWords":
            return get_words(image_b64, region, color, color_tolerance)
        elif action == "findStr":
            target = input_data.get("target", "")
            similarity = input_data.get("similarity", 0.8)
            if not target:
                return {"error": "target 为必填"}
            return find_str(image_b64, target, region, similarity, color, color_tolerance)
        else:
            return {"error": f"未知 action: {action}，支持: getWords, findStr"}
    except Exception as e:
        return {"error": str(e)}


def worker_loop():
    """持久化工作进程模式：预加载模型，逐行读入命令"""
    # 预热：加载 OCR 模型（首次调用最慢，后续复用）
    get_ocr()
    # 输出就绪信号
    sys.stdout.write(json.dumps({"ready": True}) + "\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            input_data = json.loads(line)
            if input_data.get("action") == "exit":
                break
            result = handle_command(input_data)
        except json.JSONDecodeError as e:
            result = {"error": f"JSON 解析失败: {e}"}
        except Exception as e:
            result = {"error": str(e)}

        sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def main():
    """一次性模式：stdin 读取全部 JSON，处理后输出"""
    try:
        input_data = json.loads(sys.stdin.read())
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"JSON 解析失败: {e}"}))
        sys.exit(1)

    result = handle_command(input_data)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    if "--worker" in sys.argv:
        worker_loop()
    else:
        main()
