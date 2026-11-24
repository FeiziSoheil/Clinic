from __future__ import annotations

import re

STRUCTURED_KEYS = [
    "chief_complaint",
    "duration",
    "severity",
    "medications",
    "allergies",
    "relevant_history",
]

QUESTIONS_FA = {
    "chief_complaint": "شکایت اصلی‌تان چیست؟",
    "duration": "این مشکل از چه زمانی شروع شده؟",
    "severity": "شدت علائم را از ۱ تا ۱۰ چقدر می‌دانید؟",
    "medications": "الان چه داروهایی مصرف می‌کنید؟ (اگر ندارید بنویسید هیچکدام)",
    "allergies": "حساسیت دارویی یا غذایی دارید؟",
    "relevant_history": "سابقه بیماری یا مشکل مرتبطی دارید که پزشک باید بداند؟",
}

REPROMPT_FA = {
    "chief_complaint": "لطفاً شکایت یا علامت اصلی‌تان را بگویید (مثلاً سردرد، درد شکم).",
    "duration": "لطفاً بگویید از چه زمانی شروع شده (مثلاً ۳ روز یا از دیروز).",
    "severity": "لطفاً یک عدد از ۱ تا ۱۰ برای شدت علائم بفرستید.",
    "medications": "نام داروهای مصرفی را بنویسید؛ اگر ندارید بنویسید «هیچکدام».",
    "allergies": "اگر حساسیت دارید بنویسید؛ وگرنه «ندارم».",
    "relevant_history": "سابقه مرتبط را کوتاه بنویسید؛ اگر ندارید «ندارم».",
}

FREE_CHAT_INTRO_FA = (
    "ممنون که توضیح دادید. اگر جزئیات بیشتری هست بفرمایید "
    "(مثلاً چه چیزی بهتر یا بدتر می‌کند). "
    "وقتی آماده بودید بنویسید «تمام» تا گزارش برای پزشک آماده شود."
)

WARM_OFFLINE_GREETING_FA = (
    "سلام، خوش اومدید. من دستیار پیش‌ویزیت هستم و قبل از ورود پیش پزشک "
    "کنارتان هستم تا با آرامش بگویید چه چیزی اذیتتان می‌کند. "
    "از کجا شروع کنیم؟ شکایت اصلیتان چیست؟"
)

_GREETING_RE = re.compile(
    r"^(?:سلام|درود|هی|hello|hi|hey|خوبی|خوبید|چطوری|چطورید|صبح بخیر|عصر بخیر)"
    r"(?:\s+(?:سلام|درود|هی|hello|hi|hey|خوبی|خوبید|چطوری|چطورید|صبح بخیر|عصر بخیر))*"
    r"[\s!!.?؟]*$",
    re.IGNORECASE,
)
_NONE_RE = re.compile(
    r"^(هیچ|هیچکدام|هیچ کدام|ندارم|نداره|خیر|نه|no|none|n/?a)[\s!!.?؟]*$",
    re.IGNORECASE,
)

# Persian / Arabic-Indic digits → ASCII (Python int() already accepts many, but
# we normalize so mixed strings and extraction stay predictable).
_DIGIT_TRANSLATE = str.maketrans(
    "۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩",
    "01234567890123456789",
)


def next_structured_key(answers: dict) -> str | None:
    for k in STRUCTURED_KEYS:
        if not str(answers.get(k, "")).strip():
            return k
    return None


def _severity_in_range(msg: str) -> bool:
    """Accept 1–10 including single ASCII/Persian digits (e.g. 8, ۸)."""
    normalized = msg.translate(_DIGIT_TRANSLATE)
    digits = "".join(ch for ch in normalized if ch.isdigit())
    if not digits:
        return False
    # Prefer a standalone 1–10 token; fall back to first 1–2 digit run.
    for token in re.findall(r"\d{1,2}", normalized):
        n = int(token)
        if 1 <= n <= 10:
            return True
    try:
        n = int(digits)
    except ValueError:
        return False
    return 1 <= n <= 10


def is_plausible_answer(key: str, raw: str) -> bool:
    """Reject greetings / empty noise so structured intake stays usable."""
    msg = (raw or "").strip()
    if not msg:
        return False
    if _GREETING_RE.match(msg):
        return False

    # Severity must allow single-digit answers ("8", "1", "۸") — do not apply
    # the generic len < 2 gate used for free-text fields.
    if key == "severity":
        return _severity_in_range(msg)

    if len(msg) < 2:
        return False

    if key in ("medications", "allergies", "relevant_history"):
        if _NONE_RE.match(msg):
            return True
        return len(msg) >= 2

    if key == "duration":
        return len(msg) >= 2

    # chief_complaint
    return len(msg) >= 2 and not _GREETING_RE.match(msg)
