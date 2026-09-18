import json
import sys
from pathlib import Path


sys.path.insert(
    0,
    str(Path(__file__).resolve().parent)
)

from dataset import load_training_data


BASE_DIR = Path(__file__).resolve().parents[2]

OUTPUT_DIR = (
    BASE_DIR
    / "odx-data"
    / "training"
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)

TRAINING_FILE = (
    OUTPUT_DIR
    / "odx-brain-training.jsonl"
)


def build_training_dataset():

    data = load_training_data()

    if not data:

        print(
            "ODX Brain: No training data."
        )

        return False

    with open(
        TRAINING_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        for item in data:

            training_sample = {
                "instruction":
                    item.get(
                        "prompt",
                        ""
                    ),

                "context":
                    item.get(
                        "knowledge",
                        ""
                    ),

                "response":
                    item.get(
                        "solution",
                        ""
                    )
            }

            file.write(
                json.dumps(
                    training_sample,
                    ensure_ascii=False
                )
                + "\n"
            )

    print(
        f"ODX Brain: "
        f"{len(data)} training samples prepared."
    )

    print(
        f"Training file: {TRAINING_FILE}"
    )

    return True


if __name__ == "__main__":
    build_training_dataset()