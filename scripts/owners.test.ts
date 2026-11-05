import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayOwner, ownerChangeKind, ownerClass } from '../site/owners.js';

test('owner classes for names on the roll', () => {
  const cases: [string | null, string][] = [
    ['COUNTY OF VOLUSIA', 'county'],
    ['COUNTY OF VOLUISA', 'county'],
    ['STATE OF FLORIDA TIITF', 'public'],
    ['ST JOHNS RIVER WATER MGMT DIST', 'public'],
    ['BOARD OF TR INTERNAL IMPROVEMENT TRUST', 'public'],
    ['PIONEER COMMUNITY DEVELOPMENT DISTRICT', 'public'],
    ['MIAMI ALTERNATIVES LLC', 'organization'],
    ['ARGOS US FOREST INVEST REIT LP', 'organization'],
    ['WEYERHAEUSER NR CO', 'organization'],
    ['FLORIDA AUDUBON SOCIETY', 'organization'],
    ['FORD FRANK A TR', 'individual'],
    ['G & S LEFILS FAMILY TRUST', 'individual'],
    ['', 'unknown'],
    [null, 'unknown'],
  ];
  for (const [name, cls] of cases) assert.equal(ownerClass(name), cls, String(name));
});

test('surnames that look like organization words are still treated as people', () => {
  for (const name of ['CHURCH JOHN A', 'BANK MARY', 'SMITH CO JOHN', 'SOCIETY ANN B TR']) {
    assert.equal(ownerClass(name), 'individual', name);
    assert.equal(displayOwner(name), '(private individual)', name);
  }
});

test('owner-change kinds', () => {
  assert.equal(ownerChangeKind('COUNTY OF VOLUSIA', 'SMITH JOHN'), 'left_public');
  assert.equal(ownerChangeKind('MIAMI ALTERNATIVES LLC', 'COUNTY OF VOLUSIA'), 'became_public');
  assert.equal(ownerChangeKind('COUNTY OF VOLUSIA', 'STATE OF FLORIDA'), 'changed_hands');
  assert.equal(ownerChangeKind('SMITH JOHN', 'MIAMI ALTERNATIVES LLC'), 'changed_hands');
  assert.equal(ownerChangeKind('COUNTY OF VOLUSIA', 'COUNTY OF VOLUISA'), null);
});
