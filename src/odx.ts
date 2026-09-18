import { searchInMemory } from './memory';

export interface ODXKnowledge {
  topic: string;
  knowledge: string;
  examples?: string[];
}

export class ODX {
  private knowledge: ODXKnowledge[] = [];

  addKnowledge(data: ODXKnowledge): void {
    const exists = this.knowledge.some(
      (item) =>
        item.topic.toLowerCase() ===
          data.topic.toLowerCase() &&
        item.knowledge.toLowerCase() ===
          data.knowledge.toLowerCase()
    );

    if (!exists) {
      this.knowledge.push(data);
    }
  }

  searchLocalKnowledge(query: string): ODXKnowledge[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return this.knowledge
      .map((item) => {
        const text =
          `${item.topic} ${item.knowledge}`.toLowerCase();

        const score = words.reduce(
          (total, word) =>
            text.includes(word)
              ? total + 1
              : total,
          0
        );

        return { item, score };
      })
      .filter((result) => result.score > 0)
      .sort(
        (a, b) => b.score - a.score
      )
      .map((result) => result.item);
  }

  async searchDatabase(prompt: string) {
    return await searchInMemory(prompt);
  }

  getKnowledge(): ODXKnowledge[] {
    return [...this.knowledge];
  }
}