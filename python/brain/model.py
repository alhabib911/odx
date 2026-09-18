import torch
import torch.nn as nn


class ODXBrain(nn.Module):

    def __init__(
        self,
        vocab_size: int,
        embedding_size: int = 128,
        hidden_size: int = 256,
    ):

        super().__init__()

        self.embedding = nn.Embedding(
            vocab_size,
            embedding_size
        )

        self.gru = nn.GRU(
            embedding_size,
            hidden_size,
            batch_first=True
        )

        self.output = nn.Linear(
            hidden_size,
            vocab_size
        )

    def forward(self, x):

        embedded = self.embedding(x)

        output, _ = self.gru(
            embedded
        )

        return self.output(output)


def create_brain(
    vocab_size: int
):

    return ODXBrain(
        vocab_size=vocab_size
    )


if __name__ == "__main__":

    brain = create_brain(100)

    test_input = torch.randint(
        0,
        100,
        (1, 20)
    )

    output = brain(
        test_input
    )

    print(
        "ODX Brain created successfully."
    )

    print(
        "Input:",
        test_input.shape
    )

    print(
        "Output:",
        output.shape
    )