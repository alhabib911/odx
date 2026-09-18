import json
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[2]

TRAINING_FILE = (
    BASE_DIR
    / "odx-data"
    / "training"
    / "odx-brain-training.jsonl"
)

VOCAB_FILE = (
    BASE_DIR
    / "odx-data"
    / "training"
    / "odx-vocab.json"
)


SPECIAL_TOKENS = [
    "<PAD>",
    "<UNK>",
    "<BOS>",
    "<EOS>",
]


class ODXTokenizer:

    def __init__(self, vocab=None):

        if vocab is None:

            if not VOCAB_FILE.exists():

                raise FileNotFoundError(
                    "ODX vocabulary পাওয়া যায়নি।"
                )

            with open(
                VOCAB_FILE,
                "r",
                encoding="utf-8"
            ) as file:

                vocab = json.load(file)

        self.vocab = vocab

        self.id_to_token = {
            int(index): token
            for token, index
            in vocab.items()
        }

        self.unk_id = self.vocab[
            "<UNK>"
        ]

    def encode(
        self,
        text: str
    ):

        return [
            self.vocab.get(
                character,
                self.unk_id
            )
            for character in text
        ]

    def decode(
        self,
        token_ids
    ):

        return "".join(
            self.id_to_token.get(
                int(token_id),
                "<UNK>"
            )
            for token_id
            in token_ids
        )


def build_vocabulary():

    texts = []

    if TRAINING_FILE.exists():

        with open(
            TRAINING_FILE,
            "r",
            encoding="utf-8"
        ) as file:

            for line in file:

                line = line.strip()

                if not line:
                    continue

                item = json.loads(line)

                texts.extend([
                    item.get(
                        "instruction",
                        ""
                    ),

                    item.get(
                        "context",
                        ""
                    ),

                    item.get(
                        "response",
                        ""
                    )
                ])

    vocabulary = {}

    for token in SPECIAL_TOKENS:

        vocabulary[token] = (
            len(vocabulary)
        )

    for text in texts:

        for character in text:

            if character not in vocabulary:

                vocabulary[character] = (
                    len(vocabulary)
                )

    with open(
        VOCAB_FILE,
        "w",
        encoding="utf-8"
    ) as file:

        json.dump(
            vocabulary,
            file,
            ensure_ascii=False,
            indent=2
        )

    print(
        f"ODX Vocabulary size: "
        f"{len(vocabulary)}"
    )

    return vocabulary


if __name__ == "__main__":

    vocabulary = (
        build_vocabulary()
    )

    tokenizer = ODXTokenizer(
        vocabulary
    )

    test_text = (
        "Create a React button"
    )

    token_ids = tokenizer.encode(
        test_text
    )

    decoded_text = tokenizer.decode(
        token_ids
    )

    print(
        "Original:",
        test_text
    )

    print(
        "Token IDs:",
        token_ids
    )

    print(
        "Decoded:",
        decoded_text
    )