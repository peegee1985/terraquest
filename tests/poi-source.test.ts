import { describe, expect, it } from 'vitest';

import { categorizeOsmTags, isSensitiveByName, mapOsmElementToPoi, type OsmElement } from '../convex/poiSource';

describe('categorizeOsmTags', () => {
  it('maps recognized tourism/historic/leisure/amenity/natural tags to the 6 categories', () => {
    expect(categorizeOsmTags({ tourism: 'viewpoint' })).toBe('viewpoint');
    expect(categorizeOsmTags({ historic: 'castle' })).toBe('history');
    expect(categorizeOsmTags({ tourism: 'museum' })).toBe('culture');
    expect(categorizeOsmTags({ leisure: 'park' })).toBe('nature');
    expect(categorizeOsmTags({ amenity: 'restaurant' })).toBe('gastronomy');
    expect(categorizeOsmTags({ leisure: 'stadium' })).toBe('sport');
  });

  it('returns null for anything not on the allowlist (the primary safety filter)', () => {
    expect(categorizeOsmTags({ amenity: 'place_of_worship' })).toBeNull();
    expect(categorizeOsmTags({ landuse: 'cemetery' })).toBeNull();
    expect(categorizeOsmTags({ amenity: 'grave_yard' })).toBeNull();
    expect(categorizeOsmTags({ healthcare: 'hospital' })).toBeNull();
    expect(categorizeOsmTags({ military: 'base' })).toBeNull();
    expect(categorizeOsmTags({ office: 'government' })).toBeNull();
    expect(categorizeOsmTags({ building: 'residential' })).toBeNull();
    expect(categorizeOsmTags({})).toBeNull();
  });
});

describe('isSensitiveByName', () => {
  it('flags obviously sensitive names as defense-in-depth', () => {
    expect(isSensitiveByName('Olšanské hřbitovy')).toBe(true);
    expect(isSensitiveByName('War Memorial to the Fallen')).toBe(true);
    expect(isSensitiveByName('City Cemetery')).toBe(true);
  });

  it('leaves ordinary names alone', () => {
    expect(isSensitiveByName('Petřín Lookout Tower')).toBe(false);
    expect(isSensitiveByName(undefined)).toBe(false);
  });
});

describe('mapOsmElementToPoi', () => {
  const viewpoint: OsmElement = {
    type: 'node',
    id: 123,
    lat: 50.0838,
    lon: 14.3947,
    tags: { tourism: 'viewpoint', name: 'Petřín Lookout Tower' },
  };

  it('maps a well-formed, categorizable element', () => {
    const poi = mapOsmElementToPoi(viewpoint);
    expect(poi).toEqual({
      sourceId: 'osm:node:123',
      name: 'Petřín Lookout Tower',
      category: 'viewpoint',
      latitude: 50.0838,
      longitude: 14.3947,
    });
  });

  it('uses the center point for a way/relation instead of lat/lon', () => {
    const way: OsmElement = {
      type: 'way',
      id: 456,
      center: { lat: 50.09, lon: 14.4 },
      tags: { leisure: 'park', name: 'Riegrovy sady' },
    };
    expect(mapOsmElementToPoi(way)?.latitude).toBe(50.09);
    expect(mapOsmElementToPoi(way)?.longitude).toBe(14.4);
  });

  it('rejects an element with no tags', () => {
    expect(mapOsmElementToPoi({ type: 'node', id: 1, lat: 0, lon: 0 })).toBeNull();
  });

  it('rejects an uncategorizable element', () => {
    expect(mapOsmElementToPoi({ type: 'node', id: 1, lat: 0, lon: 0, tags: { amenity: 'place_of_worship', name: 'Some church' } })).toBeNull();
  });

  it('rejects an element with no name', () => {
    expect(mapOsmElementToPoi({ type: 'node', id: 1, lat: 0, lon: 0, tags: { tourism: 'viewpoint' } })).toBeNull();
  });

  it('rejects a sensitively-named element even if categorizable', () => {
    expect(
      mapOsmElementToPoi({ type: 'node', id: 1, lat: 0, lon: 0, tags: { historic: 'monument', name: 'War Memorial to the Fallen' } }),
    ).toBeNull();
  });

  it('rejects an element missing coordinates entirely', () => {
    expect(mapOsmElementToPoi({ type: 'way', id: 1, tags: { leisure: 'park', name: 'No Coords Park' } })).toBeNull();
  });
});
