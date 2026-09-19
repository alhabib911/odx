import re
import sys
from pathlib import Path
from typing import Optional

import torch


BRAIN_DIR = Path(__file__).resolve().parent

sys.path.insert(
    0,
    str(BRAIN_DIR)
)

from model import ODXBrain
from tokenizer import ODXTokenizer


BASE_DIR = BRAIN_DIR.parents[1]

MODEL_FILE = (
    BASE_DIR
    / "odx-data"
    / "training"
    / "odx-brain.pt"
)


def load_brain():
    if not MODEL_FILE.exists():
        raise FileNotFoundError(
            "ODX Brain model পাওয়া যায়নি।"
        )

    checkpoint = torch.load(
        MODEL_FILE,
        map_location="cpu"
    )

    vocab = checkpoint.get("vocab")

    if vocab is not None:
        tokenizer = ODXTokenizer(vocab)
    else:
        tokenizer = ODXTokenizer()

    model = ODXBrain(
        vocab_size=checkpoint["vocab_size"]
    )

    model.load_state_dict(
        checkpoint["model_state"]
    )

    model.eval()

    return model, tokenizer


def extract_section(
    prompt: str,
    start_marker: str,
    end_markers: list[str]
) -> str:

    start = prompt.find(
        start_marker
    )

    if start < 0:
        return ""

    start += len(start_marker)

    end = len(prompt)

    for marker in end_markers:

        position = prompt.find(
            marker,
            start
        )

        if position >= 0:
            end = min(
                end,
                position
            )

    return prompt[start:end].strip()


def extract_user_request(
    prompt: str
) -> str:

    return extract_section(
        prompt,
        "USER REQUEST:",
        [
            "TARGET FILE:",
            "CURRENT FILE:",
            "CURRENT CODE:",
            "ODX KNOWLEDGE:",
            "IMPORTANT NEXT.JS FILE RULES:",
            "TASK:"
        ]
    )


def extract_current_code(
    prompt: str
) -> str:

    code = extract_section(
        prompt,
        "CURRENT CODE:",
        [
            "ODX KNOWLEDGE:",
            "IMPORTANT NEXT.JS FILE RULES:",
            "TASK:"
        ]
    )

    if code.lower() == "no existing code.":
        return ""

    return code


def extract_knowledge(
    prompt: str
) -> str:

    return extract_section(
        prompt,
        "ODX KNOWLEDGE:",
        [
            "IMPORTANT NEXT.JS FILE RULES:",
            "TASK:"
        ]
    )


def normalize_source_text(
    text: str
) -> str:

    if not text:
        return ""

    # Convert escaped source-code sequences
    # into real source-code characters.
    text = text.replace(
        "\\r\\n",
        "\n"
    )

    text = text.replace(
        "\\n",
        "\n"
    )

    text = text.replace(
        "\\r",
        "\n"
    )

    text = text.replace(
        "\\t",
        "\t"
    )

    text = text.replace(
        '\\"',
        '"'
    )

    text = text.replace(
        "\\'",
        "'"
    )

    return text


def extract_code_blocks(
    text: str
) -> list[str]:

    if not text:
        return []

    blocks = re.findall(
        r"```(?:tsx|ts|jsx|js|typescript|javascript)?\s*(.*?)```",
        text,
        flags=re.IGNORECASE | re.DOTALL
    )

    return [
        normalize_source_text(
            block.strip()
        )
        for block in blocks
        if block.strip()
    ]


def extract_successful_solution(
    knowledge: str
) -> str:

    if not knowledge.strip():
        return ""

    blocks = extract_code_blocks(
        knowledge
    )

    if blocks:

        return max(
            blocks,
            key=len
        )

    markers = [
        "Previous successful code:",
        "Example solution",
        "Successful solution:",
        "Solution:"
    ]

    candidates: list[str] = []

    for marker in markers:

        matches = list(
            re.finditer(
                re.escape(marker),
                knowledge,
                flags=re.IGNORECASE
            )
        )

        for match in matches:

            candidate = knowledge[
                match.end():
            ].strip()

            if candidate:
                candidates.append(
                    normalize_source_text(
                        candidate
                    )
                )

    if candidates:

        return max(
            candidates,
            key=len
        )

    return ""


def clean_output(
    result: str
) -> str:

    text = (
        result or ""
    ).strip()

    if not text:
        return ""

    text = normalize_source_text(
        text
    )

    text = text.replace(
        "\r\n",
        "\n"
    ).replace(
        "\r",
        "\n"
    )

    text = re.sub(
        r"^\s*```(?:tsx|ts|jsx|js|typescript|javascript)?\s*",
        "",
        text,
        flags=re.IGNORECASE
    )

    text = re.sub(
        r"\s*```\s*$",
        "",
        text
    )

    for token in [
        "<BOS>",
        "<PAD>",
        "<EOS>",
        "<UNK>"
    ]:

        text = text.replace(
            token,
            ""
        )

    return text.strip()


def looks_like_code(
    code: str
) -> bool:

    if not code:
        return False

    if len(code.strip()) < 12:
        return False

    signals = [
        "import ",
        "export ",
        "const ",
        "let ",
        "var ",
        "function ",
        "return ",
        "=>",
        "useState",
        "<button",
        "<div",
        "<p",
        "className",
        "{",
        "}"
    ]

    score = sum(
        1
        for signal in signals
        if signal in code
    )

    return score >= 1


def balanced_braces(
    code: str
) -> bool:

    pairs = {
        "{": "}",
        "(": ")",
        "[": "]"
    }

    stack: list[str] = []

    in_single = False
    in_double = False
    in_template = False
    escaped = False

    for char in code:

        if escaped:
            escaped = False
            continue

        if char == "\\":
            escaped = True
            continue

        if (
            char == "'"
            and not in_double
            and not in_template
        ):
            in_single = not in_single
            continue

        if (
            char == '"'
            and not in_single
            and not in_template
        ):
            in_double = not in_double
            continue

        if (
            char == "`"
            and not in_single
            and not in_double
        ):
            in_template = not in_template
            continue

        if (
            in_single
            or in_double
            or in_template
        ):
            continue

        if char in pairs:

            stack.append(
                char
            )

        elif char in pairs.values():

            if not stack:
                return False

            opening = stack.pop()

            if pairs[opening] != char:
                return False

    return (
        not stack
        and not in_single
        and not in_double
        and not in_template
    )


def contains_any(
    text: str,
    words: list[str]
) -> bool:

    lower = text.lower()

    return any(
        word.lower() in lower
        for word in words
    )


def extract_requested_text(
    request: str
) -> str:

    quoted = re.findall(
        r"[\"'“”]([^\"'“”]+)[\"'“”]",
        request
    )

    if quoted:

        values = [
            value.strip()
            for value in quoted
            if value.strip()
        ]

        if values:
            return values[-1]

    patterns = [
        r"\bwrite\s+([A-Za-z0-9][A-Za-z0-9 _-]*)$",
        r"\badd\s+([A-Za-z0-9][A-Za-z0-9 _-]*)$",
        r"\blekho\s+([A-Za-z0-9][A-Za-z0-9 _-]*)$",
        r"\blikho\s+([A-Za-z0-9][A-Za-z0-9 _-]*)$",
        r"\b(hello|hi|welcome|submit)\b"
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            request,
            flags=re.IGNORECASE
        )

        if match:

            value = match.group(1).strip()

            if value:
                return value

    return ""


def extract_button_text(
    request: str
) -> str:

    patterns = [
        r"button\s+(?:text|label)\s*(?:=|to|হবে|করো)?\s*[\"'“”]?([^\"'“”\n]+)[\"'“”]?",
        r"(?:লেখা|লিখো|লিখুন)\s+[\"'“”]?([^\"'“”\n]+)[\"'“”]?"
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            request,
            flags=re.IGNORECASE
        )

        if match:

            value = match.group(1).strip()

            if value:
                return value

    return ""


def extract_button_color(
    request: str
) -> str:

    lower = request.lower()

    color_map = {
        "green": "green-500",
        "সবুজ": "green-500",
        "red": "red-500",
        "blue": "blue-500",
        "yellow": "yellow-500",
        "orange": "orange-500",
        "purple": "purple-500",
        "black": "black",
        "white": "white"
    }

    for word, color_class in color_map.items():

        if word in lower:
            return color_class

    return "blue-500"


def requested_button_already_exists(
    code: str,
    button_text: str,
    color_class: str
) -> bool:

    if not button_text:
        return False

    escaped_text = re.escape(
        button_text
    )

    pattern = re.compile(
        rf"<button\b[^>]*>[\s\S]*?{escaped_text}[\s\S]*?</button>",
        flags=re.IGNORECASE
    )

    if pattern.search(code):
        return True

    color_pattern = re.compile(
        rf"<button\b[^>]*bg-{re.escape(color_class)}\b[^>]*>[\s\S]*?</button>",
        flags=re.IGNORECASE
    )

    if (
        color_pattern.search(code)
        and button_text.lower() in code.lower()
    ):
        return True

    return False


def update_button_text(
    code: str,
    request: str
) -> Optional[str]:

    if not contains_any(
        request,
        [
            "button text",
            "button label",
            "বাটনের লেখা",
            "বাটনের text"
        ]
    ):
        return None

    requested_text = extract_button_text(
        request
    )

    if not requested_text:
        return None

    button_pattern = re.compile(
        r"(<button\b[^>]*>)(.*?)(</button>)",
        flags=re.IGNORECASE | re.DOTALL
    )

    match = button_pattern.search(
        code
    )

    if not match:
        return None

    inner = match.group(2)

    if (
        "<" in inner
        or "{" in inner
    ):
        return None

    return (
        code[:match.start(2)]
        + f"\n          {requested_text}\n        "
        + code[match.end(2):]
    )


def insert_text_under_button(
    code: str,
    request: str
) -> Optional[str]:

    lower = request.lower()

    if not (
        "under" in lower
        or "below" in lower
        or "niche" in lower
        or "নিচে" in lower
    ):
        return None

    if not contains_any(
        request,
        [
            "button",
            "বাটন"
        ]
    ):
        return None

    color_match = re.search(
        r"(text-[a-zA-Z0-9_-]+)",
        request
    )

    color_class = (
        color_match.group(1)
        if color_match
        else ""
    )

    text_value = extract_requested_text(
        request
    )

    if not text_value:
        return None

    button_pattern = re.compile(
        r"<button\b[^>]*>.*?</button>",
        flags=re.IGNORECASE | re.DOTALL
    )

    match = button_pattern.search(
        code
    )

    if not match:
        return None

    insertion = (
        "\n      "
        f'<p className="{color_class}">'
        f"{text_value}"
        "</p>"
    )

    return (
        code[:match.end()]
        + insertion
        + code[match.end():]
    )


def add_new_button(
    code: str,
    request: str
) -> Optional[str]:

    if not contains_any(
        request,
        [
            "button",
            "বাটন"
        ]
    ):
        return None

    lower = request.lower()

    is_new_button_request = (
        "new button" in lower
        or "another button" in lower
        or "নতুন button" in lower
        or "নতুন বাটন" in lower
        or "create button" in lower
        or "তৈরি করো" in lower and "button" in lower
        or "তৈরি করো" in lower and "বাটন" in lower
    )

    if not is_new_button_request:
        return None

    button_text = (
        extract_button_text(
            request
        )
        or extract_requested_text(
            request
        )
        or "Button"
    )

    color = extract_button_color(
        request
    )

    if requested_button_already_exists(
        code,
        button_text,
        color
    ):
        return code

    button_markup = (
        "\n\n"
        '      <button '
        'type="button" '
        f'className="px-4 py-2 bg-{color} text-white rounded mt-2"'
        ">\n"
        f"        {button_text}\n"
        "      </button>"
    )

    closing_tags = [
        "</main>",
        "</div>"
    ]

    last_position = -1

    for tag in closing_tags:

        position = code.rfind(
            tag
        )

        if position > last_position:
            last_position = position

    if last_position < 0:
        return None

    return (
        code[:last_position]
        + button_markup
        + "\n"
        + code[last_position:]
    )


def add_button_when_missing(
    code: str,
    request: str
) -> Optional[str]:

    if not contains_any(
        request,
        [
            "button",
            "বাটন"
        ]
    ):
        return None

    if "<button" in code.lower():
        return None

    text_value = (
        extract_button_text(
            request
        )
        or extract_requested_text(
            request
        )
        or "Button"
    )

    color = extract_button_color(
        request
    )

    button_markup = (
        "\n\n"
        '      <button '
        'type="button" '
        f'className="px-4 py-2 bg-{color} text-white rounded"'
        ">\n"
        f"        {text_value}\n"
        "      </button>"
    )

    position = code.rfind(
        "</div>"
    )

    if position < 0:
        return None

    return (
        code[:position]
        + button_markup
        + "\n"
        + code[position:]
    )


def apply_local_edit(
    request: str,
    current_code: str
) -> Optional[str]:

    if not current_code.strip():
        return None

    # New button request gets highest priority.
    result = add_new_button(
        current_code,
        request
    )

    if (
        result is not None
        and result != current_code
    ):
        return result

    # Text under button.
    result = insert_text_under_button(
        current_code,
        request
    )

    if result:
        return result

    # Existing button text change.
    result = update_button_text(
        current_code,
        request
    )

    if result:
        return result

    # Add button when there is no button.
    result = add_button_when_missing(
        current_code,
        request
    )

    if result:
        return result

    return None


def generate_with_gru(
    prompt: str,
    max_tokens: int = 400
) -> str:

    model, tokenizer = load_brain()

    tokens = tokenizer.encode(
        prompt
    )

    if not tokens:
        return ""

    input_ids = torch.tensor(
        tokens,
        dtype=torch.long
    ).unsqueeze(0)

    generated = tokens.copy()

    with torch.no_grad():

        for _ in range(
            max_tokens
        ):

            output = model(
                input_ids
            )

            next_token = torch.argmax(
                output[:, -1, :],
                dim=-1
            ).item()

            generated.append(
                next_token
            )

            input_ids = torch.tensor(
                generated,
                dtype=torch.long
            ).unsqueeze(0)

            decoded = tokenizer.decode(
                generated
            )

            if "<EOS>" in decoded:
                break

    return tokenizer.decode(
        generated
    )


def generate(
    prompt: str,
    max_tokens: int = 400
) -> str:

    user_request = extract_user_request(
        prompt
    )

    current_code = extract_current_code(
        prompt
    )

    knowledge = extract_knowledge(
        prompt
    )

    local_edit = apply_local_edit(
        user_request,
        current_code
    )

    if local_edit:
        return local_edit

    return generate_with_gru(
        prompt,
        max_tokens
    )


def final_validate(
    result: str
) -> str:

    text = clean_output(
        result
    )

    if not text:
        return ""

    if not looks_like_code(
        text
    ):
        return ""

    if not balanced_braces(
        text
    ):
        return ""

    return text


if __name__ == "__main__":

    if len(sys.argv) > 1:

        prompt = " ".join(
            sys.argv[1:]
        )

    else:

        prompt = (
            "Create a React button"
        )

    try:

        result = generate(
            prompt,
            max_tokens=400
        )

        clean_result = final_validate(
            result
        )

        if not clean_result:

            print(
                "ODX Brain: valid local code could not be generated.",
                file=sys.stderr
            )

            sys.exit(2)

        print(
            clean_result
        )

    except Exception as error:

        print(
            f"ODX Brain Error: {error}",
            file=sys.stderr
        )

        sys.exit(1)