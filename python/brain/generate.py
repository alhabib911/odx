import sys
from pathlib import Path

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

    vocab = checkpoint.get(
        "vocab"
    )

    if vocab is not None:

        tokenizer = ODXTokenizer(
            vocab
        )

    else:

        tokenizer = ODXTokenizer()

    model = ODXBrain(
        vocab_size=
            checkpoint["vocab_size"]
    )

    model.load_state_dict(
        checkpoint["model_state"]
    )

    model.eval()

    return model, tokenizer


def generate(
    prompt: str,
    max_tokens: int = 100
):

    model, tokenizer = (
        load_brain()
    )

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

    return tokenizer.decode(
        generated
    )


def clean_output(
    result: str,
    prompt: str
):

    text = result.strip()

    if text.startswith(prompt):

        text = text[
            len(prompt):
        ].strip()

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

    code_starts = [
        "import ",
        "export ",
        "function ",
        "const ",
        "class ",
        "interface ",
        "type "
    ]

    positions = []

    for marker in code_starts:

        position = text.find(
            marker
        )

        if position >= 0:

            positions.append(
                position
            )

    if positions:

        text = text[
            min(positions):
        ]

    first_brace = text.find(
        "{"
    )

    if first_brace >= 0:

        depth = 0

        for index in range(
            first_brace,
            len(text)
        ):

            character = text[index]

            if character == "{":
                depth += 1

            elif character == "}":

                depth -= 1

                if depth == 0:

                    text = text[
                        :index + 1
                    ]

                    break

    return text.strip()


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
            max_tokens=100
        )

        clean_result = (
            clean_output(
                result,
                prompt
            )
        )

        print(
            clean_result
        )

    except Exception as error:

        print(
            f"ODX Brain Error: {error}",
            file=sys.stderr
        )

        sys.exit(1)