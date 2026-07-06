import { describe, expect, it } from 'vitest';
import { DOCS_PAGES, findDocsPage, parseDocsId } from '@/lib/docsContent';
import { QUICK_TRY_WORKFLOWS } from '@/lib/docsQuickTry';
import { EXAMPLE_WORKFLOWS } from '@/lib/exampleWorkflows';
import { getNodeDef } from '@/lib/nodeRegistry';

describe('in-app docs metadata', () => {
  it('includes the safe expression examples users need for loop stop conditions', () => {
    const page = findDocsPage('safe-expressions');
    const text = JSON.stringify(page);

    expect(text).toContain('output.count >= 3');
    expect(text).toContain('!output.data.marker');
    expect(text).toContain('Only `output` is allowed');
  });

  it('links confusing config fields to exact docs sections', () => {
    const loop = getNodeDef('LoopContainer');
    const condition = loop?.fields.find(field => field.name === 'Condition');
    const delay = loop?.fields.find(field => field.name === 'DelayBetween');
    const branch = getNodeDef('ConditionBranch')?.fields.find(field => field.name === 'Expression');

    expect(condition?.docsId).toBe('safe-expressions#loop-stop-conditions');
    expect(delay?.docsId).toBe('loop-containers#repeat-every-n-minutes');
    expect(branch?.docsId).toBe('safe-expressions#syntax');
  });

  it('keeps docs ids parseable into page and section ids', () => {
    const knownPageIds = new Set(DOCS_PAGES.map(page => page.id));
    for (const page of DOCS_PAGES) {
      for (const section of page.sections) {
        const docsId = `${page.id}#${section.id}`;
        expect(parseDocsId(docsId)).toEqual({ pageId: page.id, sectionId: section.id });
        expect(knownPageIds.has(parseDocsId(docsId).pageId)).toBe(true);
      }
    }
  });

  it('references only existing embedded workflow examples', () => {
    const exampleNames = new Set(EXAMPLE_WORKFLOWS.map(workflow => workflow.name));

    for (const page of DOCS_PAGES) {
      for (const section of page.sections) {
        for (const block of section.blocks) {
          if (block.type !== 'workflow-examples') continue;
          for (const name of block.examples) {
            expect(exampleNames.has(name), `${page.id}#${section.id} references ${name}`).toBe(true);
          }
        }
      }
    }
  });

  it('allows quick try only for existing curated examples', () => {
    const exampleNames = new Set(EXAMPLE_WORKFLOWS.map(workflow => workflow.name));

    for (const name of QUICK_TRY_WORKFLOWS) {
      expect(exampleNames.has(name), `Quick try references ${name}`).toBe(true);
    }
  });
});
