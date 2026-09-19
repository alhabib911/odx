import sys
import json
import shutil
import random
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


EPOCHS = 60
LEARNING_RATE = 0.0007
GRADIENT_CLIP = 1.0


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

            try:
                item = json.loads(line)
            except json.JSONDecodeError:
                continue

            instruction = str(
                item.get(
                    "instruction",
                    ""
                )
            ).strip()

            context = str(
                item.get(
                    "context",
                    ""
                )
            ).strip()

            response = str(
                item.get(
                    "response",
                    ""
                )
            ).strip()

            text_parts = []

            if instruction:
                text_parts.append(
                    "USER:\n" + instruction
                )

            if context:
                text_parts.append(
                    "CONTEXT:\n" + context
                )

            if response:
                text_parts.append(
                    "RESPONSE:\n" + response
                )

            text = "\n\n".join(
                text_parts
            )

            if not text:
                continue

            tokens = tokenizer.encode(
                text
            )

            if len(tokens) > 1:
                samples.append(tokens)

    return samples


def copy_matching_weights(
    old_model,
    old_vocab,
    new_model,
    new_vocab
):
    """
    Transfer learned weights from the previous model
    into the new model even when vocabulary grows.

    This prevents retraining from zero every time.
    """

    if not old_vocab:
        return

    old_state = old_model.state_dict()
    new_state = new_model.state_dict()

    # ---------------------------------------------
    # Embedding
    # ---------------------------------------------

    for token, new_id in new_vocab.items():

        old_id = old_vocab.get(token)

        if old_id is None:
            continue

        if (
            old_id < old_state["embedding.weight"].shape[0]
            and
            new_id < new_state["embedding.weight"].shape[0]
        ):

            new_state[
                "embedding.weight"
            ][new_id].copy_(
                old_state[
                    "embedding.weight"
                ][old_id]
            )

    # ---------------------------------------------
    # Output layer
    # ---------------------------------------------

    for token, new_id in new_vocab.items():

        old_id = old_vocab.get(token)

        if old_id is None:
            continue

        if (
            old_id < old_state["output.weight"].shape[0]
            and
            new_id < new_state["output.weight"].shape[0]
        ):

            new_state[
                "output.weight"
            ][new_id].copy_(
                old_state[
                    "output.weight"
                ][old_id]
            )

            new_state[
                "output.bias"
            ][new_id].copy_(
                old_state[
                    "output.bias"
                ][old_id]
            )

    # ---------------------------------------------
    # GRU weights
    # ---------------------------------------------

    for key in [
        "gru.weight_ih_l0",
        "gru.weight_hh_l0",
        "gru.bias_ih_l0",
        "gru.bias_hh_l0"
    ]:

        if key in old_state and key in new_state:

            if (
                old_state[key].shape ==
                new_state[key].shape
            ):

                new_state[key].copy_(
                    old_state[key]
                )

    new_model.load_state_dict(
        new_state
    )


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

            if len(tokens) < 2:
                continue

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
                targets.reshape(
                    -1
                )
            )

            total_loss += (
                loss.item()
            )

    return (
        total_loss /
        max(
            len(samples),
            1
        )
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


def load_previous_model(
    vocabulary,
    vocab_size
):
    """
    Load the current brain and expand it to the
    new vocabulary when necessary.
    """

    if not MODEL_FILE.exists():
        return None

    try:

        checkpoint = torch.load(
            MODEL_FILE,
            map_location="cpu"
        )

        old_vocab = checkpoint.get(
            "vocab"
        )

        old_vocab_size = checkpoint.get(
            "vocab_size"
        )

        if not old_vocab or not old_vocab_size:
            return None

        old_model = ODXBrain(
            vocab_size=old_vocab_size
        )

        old_model.load_state_dict(
            checkpoint[
                "model_state"
            ]
        )

        old_model.eval()

        expanded_model = ODXBrain(
            vocab_size=vocab_size
        )

        expanded_model.eval()

        copy_matching_weights(
            old_model,
            old_vocab,
            expanded_model,
            vocabulary
        )

        return expanded_model

    except Exception as error:

        print(
            "Previous Brain load skipped:",
            error
        )

        return None


def train():
    print(
        "🧠 ODX Brain incremental training started..."
    )

    vocabulary = build_vocabulary()

    tokenizer = ODXTokenizer(
        vocabulary
    )

    samples = load_training_samples(
        tokenizer
    )

    if not samples:

        print(
            "ODX Brain: No training samples."
        )

        return False

    vocab_size = len(
        tokenizer.vocab
    )

    print(
        f"🧠 ODX Vocabulary size: {vocab_size}"
    )

    print(
        f"📚 Training samples: {len(samples)}"
    )

    # -------------------------------------------------
    # Load previous brain and transfer its knowledge.
    # -------------------------------------------------

    previous_model = load_previous_model(
        vocabulary,
        vocab_size
    )

    if previous_model is not None:

        print(
            "♻️ Previous Brain loaded."
        )

        print(
            "🧠 Existing learned weights preserved."
        )

        old_loss = calculate_loss(
            previous_model,
            samples,
            vocab_size
        )

    else:

        print(
            "🆕 No compatible previous Brain found."
        )

        previous_model = ODXBrain(
            vocab_size=vocab_size
        )

        old_loss = calculate_loss(
            previous_model,
            samples,
            vocab_size
        )

    print(
        f"🧪 Before Training Loss: {old_loss:.6f}"
    )

    # -------------------------------------------------
    # Training starts from previous knowledge,
    # not from random weights.
    # -------------------------------------------------

    new_model = previous_model

    optimizer = optim.Adam(
        new_model.parameters(),
        lr=LEARNING_RATE
    )

    loss_function = (
        nn.CrossEntropyLoss()
    )

    new_model.train()

    training_samples = list(
        samples
    )

    for epoch in range(
        EPOCHS
    ):

        random.shuffle(
            training_samples
        )

        total_loss = 0.0
        processed = 0

        for tokens in training_samples:

            if len(tokens) < 2:
                continue

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
                targets.reshape(
                    -1
                )
            )

            loss.backward()

            torch.nn.utils.clip_grad_norm_(
                new_model.parameters(),
                GRADIENT_CLIP
            )

            optimizer.step()

            total_loss += (
                loss.item()
            )

            processed += 1

        if (
            epoch == 0
            or (epoch + 1) % 10 == 0
        ):

            average_epoch_loss = (
                total_loss /
                max(
                    processed,
                    1
                )
            )

            print(
                f"Epoch "
                f"{epoch + 1}/{EPOCHS} "
                f"Loss: "
                f"{average_epoch_loss:.6f}"
            )

    # -------------------------------------------------
    # Final evaluation
    # -------------------------------------------------

    new_loss = calculate_loss(
        new_model,
        samples,
        vocab_size
    )

    print(
        f"🧪 After Training Loss: {new_loss:.6f}"
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

        "previous_loss":
            old_loss,

        "version":
            version_name,

        "created_at":
            now.isoformat(),

        "training_mode":
            "incremental"
    }

    version_file = save_version(
        checkpoint,
        version_name
    )

    # -------------------------------------------------
    # Only activate a model that improved.
    # -------------------------------------------------

    should_activate = (
        new_loss <= old_loss
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
            "🛡️ Old Brain remains active."
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