import argparse
import json
import sys

from transformers import AutoTokenizer, AutoModelForCausalLM


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        required=True
    )
    args = parser.parse_args()

    print(
        f"Loading local model: {args.model}",
        file=sys.stderr
    )

    tokenizer = AutoTokenizer.from_pretrained(
        args.model
    )

    model = AutoModelForCausalLM.from_pretrained(
        args.model
    )

    print(
        "ODX Local Model loaded.",
        file=sys.stderr
    )

    for line in sys.stdin:
        line = line.strip()

        if not line:
            continue

        try:
            request = json.loads(line)

            prompt = request["prompt"]
            temperature = request.get(
                "temperature",
                0.1
            )
            max_new_tokens = request.get(
                "max_new_tokens",
                2048
            )

            inputs = tokenizer(
                prompt,
                return_tensors="pt"
            )

            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                do_sample=temperature > 0
            )

            generated = outputs[0][
                inputs["input_ids"].shape[1]:
            ]

            text = tokenizer.decode(
                generated,
                skip_special_tokens=True
            )

            print(
                json.dumps({
                    "success": True,
                    "text": text
                }),
                flush=True
            )

        except Exception as error:
            print(
                json.dumps({
                    "success": False,
                    "error": str(error)
                }),
                flush=True
            )


if __name__ == "__main__":
    main()