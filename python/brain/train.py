import sys
import json
import shutil
from pathlib import Path
from datetime import datetime

import torch
import torch.nn as nn
import torch.optim as optim


BRAIN_DIR = Path(__file__).resolve().parent

sys.path.insert(
    0,
    str(BRAIN_DIR)
)

from model import ODXBrain
from tokenizer import (
    ODXTokenizer,
    build_vocabulary
)


BASE_DIR = BRAIN_DIR.parents[1]

TRAINING_DIR = (
    BASE_DIR
    / "odx-data"
    / "training"
)

MODEL_FILE = (
    TRAINING_DIR
    / "odx-brain.pt"
)

VERSIONS_DIR = (
    TRAINING_DIR
    / "versions"
)

VERSIONS_DIR.mkdir(
    parents=True,
    exist_ok=True
)


def load_training_samples(
    tokenizer
):

    samples = []

    training_file = (
        TRAINING_DIR
        / "odx-brain-training.jsonl"
    )

    if not training_file.exists():

        return samples

    with open(
        training_file,
        "r",
        encoding="utf-8"
    ) as file:

        for line in file:

            line = line.strip()

            if not line:
                continue

            item = json.loads(line)

            text = (
                item.get(
                    "instruction",
                    ""
                )
                + "\n"
                + item.get(
                    "context",
                    ""
                )
                + "\n"
                + item.get(
                    "response",
                    ""
                )
            )

            tokens = tokenizer.encode(
                text
            )

            if len(tokens) > 1:

                samples.append(
                    tokens
                )

    return samples


def calculate_loss(
    model,
    samples,
    vocab_size
):

    if not samples:
        return float("inf")

    loss_function = (
        nn.CrossEntropyLoss()
    )

    model.eval()

    total_loss = 0.0

    with torch.no_grad():

        for tokens in samples:

            inputs = torch.tensor(
                tokens[:-1],
                dtype=torch.long
            ).unsqueeze(0)

            targets = torch.tensor(
                tokens[1:],
                dtype=torch.long
            ).unsqueeze(0)

            output = model(
                inputs
            )

            loss = loss_function(
                output.reshape(
                    -1,
                    vocab_size
                ),
                targets.reshape(-1)
            )

            total_loss += (
                loss.item()
            )

    return (
        total_loss
        / len(samples)
    )


def save_version(
    checkpoint,
    version_name
):

    version_file = (
        VERSIONS_DIR
        / f"{version_name}.pt"
    )

    torch.save(
        checkpoint,
        version_file
    )

    return version_file


def train():

    print(
        "🧠 ODX Brain training started..."
    )

    vocabulary = (
        build_vocabulary()
    )

    tokenizer = ODXTokenizer(
        vocabulary
    )

    samples = (
        load_training_samples(
            tokenizer
        )
    )

    if not samples:

        print(
            "ODX Brain: No training samples."
        )

        return False

    vocab_size = len(
        tokenizer.vocab
    )

    new_model = ODXBrain(
        vocab_size=vocab_size
    )

    optimizer = optim.Adam(
        new_model.parameters(),
        lr=0.001
    )

    loss_function = (
        nn.CrossEntropyLoss()
    )

    epochs = 100

    new_model.train()

    for epoch in range(epochs):

        total_loss = 0.0

        for tokens in samples:

            inputs = torch.tensor(
                tokens[:-1],
                dtype=torch.long
            ).unsqueeze(0)

            targets = torch.tensor(
                tokens[1:],
                dtype=torch.long
            ).unsqueeze(0)

            optimizer.zero_grad()

            output = new_model(
                inputs
            )

            loss = loss_function(
                output.reshape(
                    -1,
                    vocab_size
                ),
                targets.reshape(-1)
            )

            loss.backward()

            optimizer.step()

            total_loss += (
                loss.item()
            )

        if (
            epoch == 0
            or (epoch + 1) % 10 == 0
        ):

            print(
                f"Epoch "
                f"{epoch + 1}/{epochs} "
                f"Loss: "
                f"{total_loss:.6f}"
            )

    new_loss = calculate_loss(
        new_model,
        samples,
        vocab_size
    )

    print(
        f"🧪 New Brain Loss: "
        f"{new_loss:.6f}"
    )

    now = datetime.now()

    version_name = (
        "odx-brain-"
        + now.strftime(
            "%Y%m%d-%H%M%S"
        )
    )

    checkpoint = {
        "model_state":
            new_model.state_dict(),

        "vocab_size":
            vocab_size,

        "vocab":
            tokenizer.vocab,

        "training_samples":
            len(samples),

        "loss":
            new_loss,

        "version":
            version_name,

        "created_at":
            now.isoformat()
    }

    version_file = save_version(
        checkpoint,
        version_name
    )

    old_loss = None

    if MODEL_FILE.exists():

        try:

            old_checkpoint = torch.load(
                MODEL_FILE,
                map_location="cpu"
            )

            old_vocab_size = (
                old_checkpoint[
                    "vocab_size"
                ]
            )

            old_vocab = (
                old_checkpoint.get(
                    "vocab"
                )
            )

            if (
                old_vocab is not None
                and old_vocab_size == vocab_size
                and old_vocab == tokenizer.vocab
            ):

                old_model = ODXBrain(
                    vocab_size=vocab_size
                )

                old_model.load_state_dict(
                    old_checkpoint[
                        "model_state"
                    ]
                )

                old_loss = calculate_loss(
                    old_model,
                    samples,
                    vocab_size
                )

                print(
                    f"🧪 Old Brain Loss: "
                    f"{old_loss:.6f}"
                )

        except Exception as error:

            print(
                "Old model comparison skipped:",
                error
            )

    should_activate = (
        old_loss is None
        or new_loss <= old_loss
    )

    if should_activate:

        if MODEL_FILE.exists():

            backup_file = (
                TRAINING_DIR
                / "odx-brain-previous.pt"
            )

            shutil.copy2(
                MODEL_FILE,
                backup_file
            )

        shutil.copy2(
            version_file,
            MODEL_FILE
        )

        print(
            "✅ New Brain is better/equal."
        )

        print(
            "🚀 New Brain activated."
        )

    else:

        print(
            "⚠️ New Brain is worse."
        )

        print(
            "Old Brain remains active."
        )

    print(
        f"📦 Version: {version_name}"
    )

    print(
        f"📁 Version saved: {version_file}"
    )

    print(
        "ODX Brain training completed"
    )

    return True


if __name__ == "__main__":

    success = train()

    if not success:
        sys.exit(1)