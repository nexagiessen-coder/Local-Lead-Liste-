import { describe, it, expect } from 'vitest';
import { parseCommand } from '@/lib/command/parse';

describe('natural language command parser', () => {
  it('parses "Build me a lead list for Frankfurt"', () => {
    const result = parseCommand('Build me a lead list for Frankfurt');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.location).toBe('Frankfurt');
    expect(result.category).toBeNull();
    expect(result.count).toBe(20);
    expect(result.assumptions.length).toBeGreaterThan(0);
  });

  it('parses "Find 20 barbers around Gießen"', () => {
    const result = parseCommand('Find 20 barbers around Gießen');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.location).toBe('Gießen');
    expect(result.category).toBe('barber');
    expect(result.count).toBe(20);
  });

  it('parses a radius: "Find restaurants within 15 km of Frankfurt"', () => {
    const result = parseCommand('Find restaurants within 15 km of Frankfurt');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.radiusKm).toBe(15);
    expect(result.category).toBe('restaurant');
    expect(result.location).toBe('Frankfurt');
  });

  it('parses German input', () => {
    const result = parseCommand('Finde 30 Friseure im Umkreis von 25 km um Gießen');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.count).toBe(30);
    expect(result.radiusKm).toBe(25);
    expect(result.category).toBe('barber');
    expect(result.location).toBe('Gießen');
  });

  it('does not mistake the radius number for the lead count', () => {
    const result = parseCommand('Find restaurants within 15 km of Frankfurt');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.count).toBe(20); // default, not 15
  });

  it('caps the radius and count at safe maximums', () => {
    const result = parseCommand('Find 900 barbers within 400 km of Frankfurt');
    expect(result.kind).toBe('research');
    if (result.kind !== 'research') return;
    expect(result.radiusKm).toBeLessThanOrEqual(50);
    expect(result.count).toBeLessThanOrEqual(100);
  });

  it("parses \"Show today's uncalled leads\"", () => {
    const result = parseCommand("Show today's uncalled leads");
    expect(result.kind).toBe('filter');
    if (result.kind !== 'filter') return;
    expect(result.filters.uncalled).toBe(true);
    expect(result.scope).toBe('leads');
  });

  it('parses "Show leads that are open right now"', () => {
    const result = parseCommand('Show leads that are open right now');
    expect(result.kind).toBe('filter');
    if (result.kind !== 'filter') return;
    expect(result.filters.openNow).toBe(true);
  });

  it('routes manual-verification requests to the research pool', () => {
    const result = parseCommand('Show businesses needing manual verification');
    expect(result.kind).toBe('filter');
    if (result.kind !== 'filter') return;
    expect(result.scope).toBe('pool');
    expect(result.filters.websiteStatus).toContain('REQUIRES_MANUAL_CHECK');
  });

  it('refuses to guess when no location is given', () => {
    const result = parseCommand('Find 20 barbers');
    expect(result.kind).toBe('unknown');
    if (result.kind !== 'unknown') return;
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.explanation).toMatch(/location/i);
  });

  it('returns unknown rather than inventing a command', () => {
    const result = parseCommand('asdf qwer zxcv');
    expect(result.kind).toBe('unknown');
  });
});
