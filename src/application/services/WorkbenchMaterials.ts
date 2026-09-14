/**
 * Copyright (c) 2026 linlisWorkTeam
 * SPDX-License-Identifier: MIT
 * 文件功能：捕获用户指定来源的不可变外部材料及审计工件。
 */
import { sha256 } from '../../domain/Domain.ts';
import { MATERIAL_CONTRACT, materialIdentity } from '../../domain/association/ExternalMaterial.ts';
import type { ArtifactStore } from '../ports/ApplicationPorts.ts';
import type { ExternalMaterialReader, ExternalMaterialStore, MaterialTextExtractor } from '../ports/ExternalMaterialPorts.ts';
export class WorkbenchMaterials {
  readonly reader: ExternalMaterialReader; readonly store: ExternalMaterialStore; readonly artifacts: ArtifactStore; readonly extractor: MaterialTextExtractor;
  constructor(reader: ExternalMaterialReader, store: ExternalMaterialStore, artifacts: ArtifactStore, extractor: MaterialTextExtractor) { this.reader = reader; this.store = store; this.artifacts = artifacts; this.extractor = extractor; }
  async capture(sourceId: string, applicability: string) {
    if (typeof sourceId !== 'string' || !sourceId || typeof applicability !== 'string' || !applicability.trim() || applicability.length > 2000) throw new Error('MATERIAL_INPUT_INVALID');
    const source = await this.reader.readSourceMaterial(sourceId);
    if (source.revision !== `sha256:${sha256(source.bytes)}`) throw new Error('SOURCE_REVISION_INVALID');
    const text = this.extractor.extract(source.bytes, source.mediaType);
    const rawRef = await this.artifacts.put(source.bytes, source.mediaType);
    const textRef = await this.artifacts.put(Buffer.from(text), 'text/plain');
    const value = { sourceId, sourceRevision: source.revision, locator: source.locator, title: source.title,
      applicability: applicability.trim(), rawRef, textRef, capturedAt: new Date().toISOString(), contractVersion: MATERIAL_CONTRACT };
    return this.store.insert({ ...value, materialId: materialIdentity(value) });
  }
  async artifact(id: string, digest: string) {
    const material = this.store.get(id); if (!material) throw new Error('MATERIAL_NOT_FOUND');
    const ref = [material.rawRef, material.textRef].find((value) => value.sha256 === digest);
    if (!ref) throw new Error('MATERIAL_NOT_FOUND');
    if (!await this.artifacts.verify(ref)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return { ref, bytes: await this.artifacts.get(ref) };
  }
  async read(id: string) {
    const material = this.store.get(id); if (!material) throw new Error('MATERIAL_NOT_FOUND');
    if (!await this.artifacts.verify(material.textRef) || !await this.artifacts.verify(material.rawRef)) throw new Error('STAGE_ARTIFACT_CORRUPT');
    return { material, text: Buffer.from(await this.artifacts.get(material.textRef)).toString('utf8') };
  }
}
