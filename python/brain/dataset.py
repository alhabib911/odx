import json
import hashlib
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


def create_hash(
    prompt: str,
    knowledge: str,
    solution: str,
) -> str:

    content = (
        prompt.strip()
        + "|"
        + knowledge.strip()
        + "|"
        + solution.strip()
    )

    return hashlib.sha256(
        content.encode("utf-8")
    ).hexdigest()


def load_training_data():

    if not DATASET_FILE.exists():
        return []

    data = []

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

                data.append(
                    json.loads(line)
                )

            except json.JSONDecodeError:
                continue

    return data


def add_training_data(
    prompt: str,
    knowledge: str,
    solution: str,
):

    existing_data =
        load_training_data()

    content_hash = create_hash(
        prompt,
        knowledge,
        solution
    )

    for item in existing_data:

        if item.get("hash") == content_hash:

            print(
                "ODX Training: duplicate skipped."
            )

            return False

    item = {
        "hash": content_hash,
        "prompt": prompt,
        "knowledge": knowledge,
        "solution": solution,
    }

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

    print(
        "ODX Training: sample added."
    )

    print(
        f"ODX Training samples: "
        f"{len(existing_data) + 1}"
    )

    return True


if __name__ == "__main__":

    input_data = (
        sys.stdin.read()
        .strip()
    )

    if input_data:

        for line in input_data.splitlines():

            line = line.strip()

            if not line:
                continue

            try:

                item = json.loads(line)

                prompt = item.get(
                    "prompt",
                    ""
                ).strip()

                knowledge = item.get(
                    "knowledge",
                    ""
                ).strip()

                solution = item.get(
                    "solution",
                    ""
                ).strip()

                if not prompt:
                    raise ValueError(
                        "prompt is required"
                    )

                if not solution:
                    raise ValueError(
                        "solution is required"
                    )

                add_training_data(
                    prompt,
                    knowledge,
                    solution
                )

            except Exception as error:

                print(
                    f"ODX Training Error: {error}",
                    file=sys.stderr
                )

    else:

        data = load_training_data()

        print(
            f"ODX Training Data: {len(data)}"
        )