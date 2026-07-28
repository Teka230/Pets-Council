import assert from 'node:assert/strict';
import test from 'node:test';
import { createProductLayoutState, shouldOfferProductLayout } from './productLayout';

test('offers the product layout until version one is explicitly applied',()=>{assert.equal(shouldOfferProductLayout(undefined),true);assert.equal(shouldOfferProductLayout({version:1,appliedAt:10}),false);});
test('creates a stable versioned layout marker',()=>{assert.deepEqual(createProductLayoutState(42),{version:1,appliedAt:42});});
