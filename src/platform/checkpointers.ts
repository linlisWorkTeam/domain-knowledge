import { mkdir } from "node:fs/promises";
import path from "node:path";
import { BaseCheckpointSaver, MemorySaver } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export interface CheckpointerFactory {
  create(): Promise<BaseCheckpointSaver>;
}

export class InMemoryCheckpointerFactory implements CheckpointerFactory {
  public async create(): Promise<BaseCheckpointSaver> {
    return new MemorySaver();
  }
}

export class SqliteCheckpointerFactory implements CheckpointerFactory {
  public constructor(private readonly filename = path.resolve(".agent-runs/checkpoints.sqlite")) {}

  public async create(): Promise<BaseCheckpointSaver> {
    await mkdir(path.dirname(this.filename), { recursive: true });
    return SqliteSaver.fromConnString(this.filename);
  }
}
