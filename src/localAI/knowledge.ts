import {
  searchInMemory
} from '../memory';

export interface LocalKnowledge {
  prompt: string;
  filePath: string;
  code: string;
  similarity?: number;
}

export class ODXLocalKnowledge {
  async search(
    prompt: string
  ): Promise<LocalKnowledge[]> {
    const result =
      await searchInMemory(prompt);

    const textResults =
      result.textResults || [];

    const vectorResults =
      result.vectorResults || [];

    const knowledge: LocalKnowledge[] = [
      ...textResults.map((item: any) => ({
        prompt: item.prompt,
        filePath: item.file_path,
        code: item.code_content
      })),

      ...vectorResults.map((item: any) => ({
        prompt: item.prompt,
        filePath: item.file_path,
        code: item.code_content,
        similarity: item.similarity
      }))
    ];

    return knowledge;
  }

  buildContext(
    knowledge: LocalKnowledge[]
  ): string {
    if (knowledge.length === 0) {
      return '';
    }

    return knowledge
      .map(
        (item, index) => `
Knowledge ${index + 1}

Prompt:
${item.prompt}

File:
${item.filePath}

Code:
${item.code}
`.trim()
      )
      .join('\n\n');
  }
}