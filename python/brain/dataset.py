import json
import hashlib
import re
import sys
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]

TRAINING_DIR = (
    BASE_DIR
    / "odx-data"
    / "training"
)

TRAINING_DIR.mkdir(
    parents=True,
    exist_ok=True
)

DATASET_FILE = (
    TRAINING_DIR
    / "odx-training.jsonl"
)


def normalize_text(
    text: str
) -> str:
    """
    Normalize text so trivial formatting differences
    do not create duplicate training samples.
    """

    if not text:
        return ""

    text = str(text)

    text = text.replace(
        "\r\n",
        "\n"
    ).replace(
        "\r",
        "\n"
    )

    text = re.sub(
        r"[ \t]+",
        " ",
        text
    )

    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text
    )

    return text.strip()


def create_hash(
    prompt: str,
    knowledge: str,
    solution: str,
) -> str:

    normalized_prompt = normalize_text(
        prompt
    )

    normalized_knowledge = normalize_text(
        knowledge
    )

    normalized_solution = normalize_text(
        solution
    )

    content = (
        normalized_prompt
        + "|"
        + normalized_knowledge
        + "|"
        + normalized_solution
    )

    return hashlib.sha256(
        content.encode("utf-8")
    ).hexdigest()


def load_training_data():

    if not DATASET_FILE.exists():
        return []

    data = []

    try:
        with open(
            DATASET_FILE,
            "r",
            encoding="utf-8"
        ) as file:

            for line in file:

                line = line.strip()

                if not line:
                    continue

                try:
                    item = json.loads(
                        line
                    )

                    if isinstance(
                        item,
                        dict
                    ):
                        data.append(item)

                except json.JSONDecodeError:
                    continue

    except OSError as error:

        print(
            f"ODX Training Read Error: {error}",
            file=sys.stderr
        )

    return data


def add_training_data(
    prompt: str,
    knowledge: str,
    solution: str,
):

    prompt = normalize_text(
        prompt
    )

    knowledge = normalize_text(
        knowledge
    )

    solution = normalize_text(
        solution
    )

    if not prompt:
        print(
            "ODX Training Error: prompt is required.",
            file=sys.stderr
        )

        return False

    if not solution:
        print(
            "ODX Training Error: solution is required.",
            file=sys.stderr
        )

        return False

    existing_data = (
        load_training_data()
    )

    content_hash = create_hash(
        prompt,
        knowledge,
        solution
    )

    # ==================================================
    # EXACT DUPLICATE CHECK
    # ==================================================

    for item in existing_data:

        if (
            item.get("hash")
            == content_hash
        ):
            print(
                "ODX Training: duplicate skipped."
            )

            return False

    # ==================================================
    # SAVE NEW TRAINING SAMPLE
    # ==================================================

    item = {
        "hash": content_hash,
        "prompt": prompt,
        "knowledge": knowledge,
        "solution": solution,
    }

    try:

        with open(
            DATASET_FILE,
            "a",
            encoding="utf-8"
        ) as file:

            file.write(
                json.dumps(
                    item,
                    ensure_ascii=False
                )
                + "\n"
            )

    except OSError as error:

        print(
            f"ODX Training Write Error: {error}",
            file=sys.stderr
        )

        return False

    print(
        "ODX Training: sample added."
    )

    print(
        f"ODX Training samples: "
        f"{len(existing_data) + 1}"
    )

    return True


def process_input_line(
    line: str
) -> bool:

    line = line.strip()

    if not line:
        return False

    try:

        item = json.loads(
            line
        )

    except json.JSONDecodeError as error:

        print(
            f"ODX Training JSON Error: {error}",
            file=sys.stderr
        )

        return False

    if not isinstance(
        item,
        dict
    ):

        print(
            "ODX Training Error: input must be a JSON object.",
            file=sys.stderr
        )

        return False

    prompt = normalize_text(
        item.get(
            "prompt",
            ""
        )
    )

    knowledge = normalize_text(
        item.get(
            "knowledge",
            ""
        )
    )

    solution = normalize_text(
        item.get(
            "solution",
            ""
        )
    )

    return add_training_data(
        prompt,
        knowledge,
        solution
    )


if __name__ == "__main__":

    input_data = (
        sys.stdin.read()
        .strip()
    )

    if input_data:

        for line in input_data.splitlines():

            process_input_line(
                line
            )

    else:

        data = load_training_data()

        print(
            f"ODX Training Data: {len(data)}"
        )