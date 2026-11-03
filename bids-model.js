// Prices a Select Greens bid from the `rates` table (staff page only). Same method as the
// public estimator: cost lines / (1 - margin), site adjustments, customer-priced add-ons,
// minimum, then a range. The numbers live in the database, not in this file.
(function (root) {
  const roundDown = (n) => Math.floor(n / 50) * 50;
  const roundUp = (n) => Math.ceil(n / 50) * 50;

  function ratesFromRows(rows) {
    const r = {};
    rows.forEach((row) => { r[row.key] = Number(row.value); });
    return r;
  }

  // cfg: { type, tier, sqft, base, sodCut, edging, edgingFeet, colored, slope, clay, wheelbarrow, cup }
  function priceBid(cfg, r) {
    const sqft = cfg.sqft, type = cfg.type, m = r.margin;
    const bags = Math.ceil(sqft / r.infill_sqft_per_bag);
    const feet = cfg.edging === 'none' ? 0 : (cfg.edgingFeet > 0 ? cfg.edgingFeet : Math.round(4 * Math.sqrt(sqft)));
    const baseAdd = cfg.base === 'standard' ? 0 : r['base_add_' + cfg.base];

    const cost = {
      turf: sqft * r.waste * r['turf_rate_' + type + '_' + cfg.tier],
      base: sqft * (r.base_cost + baseAdd),
      sod: cfg.sodCut ? sqft * r.sod_disposal : 0,
      infill: bags * r.infill_bag_cost,
      materials: sqft * r.materials,
      equipment: sqft * r.equipment,
      labor: sqft * r['labor_rate_' + type]
    };
    const costExLabor = cost.turf + cost.base + cost.sod + cost.infill + cost.materials + cost.equipment;

    const edgingAdd = feet * (cfg.edging === 'none' ? 0 : r['edging_' + cfg.edging]);
    const coloredAdd = cfg.colored ? bags * r.colored_infill_per_bag : 0;
    const cupAdd = type === 'green' && cfg.cup ? r.cup_package : 0;
    const addOns = edgingAdd + coloredAdd + cupAdd;

    const slope = cfg.slope === 'steep' ? [r.slope_steep_low, r.slope_steep_high] : [0, 0];
    const clay = cfg.clay ? [r.clay_low, r.clay_high] : [0, 0];
    const barrow = cfg.wheelbarrow ? [r.wheelbarrow_low, r.wheelbarrow_high] : [0, 0];

    const scenario = (i) => {
      let price = (costExLabor + cost.labor * (1 + barrow[i])) / (1 - m);
      price += sqft * clay[i];
      price *= 1 + slope[i];
      return price + addOns;
    };

    const min = r['minimum_' + type];
    const lo = Math.max(scenario(0) * r.range_low, min);
    const hi = Math.max(scenario(1), scenario(0) * r.range_high, min * r.range_high);

    // Itemized lines at the low end of every range
    const kinds = [['turf', 'Turf incl. waste'], ['base', 'Road base and fines'], ['sod', 'Sod disposal'],
      ['infill', 'Infill (' + bags + ' bags)'], ['materials', 'Nails, seam tape, weed barrier'],
      ['equipment', 'Equipment'], ['labor', 'Labor']];
    const lines = kinds.filter((k) => cost[k[0]] > 0).map((k) => ({
      kind: k[0] === 'sod' ? 'sod' : k[0], description: k[1], quantity: null, unit: null,
      cost: round2(cost[k[0]]), price: round2(cost[k[0]] / (1 - m))
    }));
    let subtotal = (costExLabor + cost.labor) / (1 - m);
    let costTotal = costExLabor + cost.labor;
    if (barrow[0] > 0) {
      const extra = cost.labor * barrow[0];
      lines.push({ kind: 'adjustment', description: 'Wheelbarrow-only access (labor)', quantity: null, unit: null, cost: round2(extra), price: round2(extra / (1 - m)) });
      subtotal += extra / (1 - m); costTotal += extra;
    }
    if (clay[0] > 0) {
      lines.push({ kind: 'adjustment', description: 'Clay soil', quantity: sqft, unit: 'sq ft', cost: null, price: round2(sqft * clay[0]) });
      subtotal += sqft * clay[0];
    }
    if (slope[0] > 0) {
      const extra = subtotal * slope[0];
      lines.push({ kind: 'adjustment', description: 'Steep slope', quantity: null, unit: null, cost: null, price: round2(extra) });
      subtotal += extra;
    }
    if (edgingAdd > 0) lines.push({ kind: 'edging', description: 'Edging (' + cfg.edging + ')', quantity: feet, unit: 'ft', cost: null, price: round2(edgingAdd) });
    if (coloredAdd > 0) lines.push({ kind: 'addon', description: 'Colored infill', quantity: bags, unit: 'bags', cost: null, price: round2(coloredAdd) });
    if (cupAdd > 0) lines.push({ kind: 'addon', description: 'Cup + fringe package', quantity: 1, unit: 'pkg', cost: null, price: round2(cupAdd) });

    return {
      lines: lines, costTotal: round2(costTotal), margin: m, edgingFeet: feet,
      modelPrice: round2(scenario(0)), low: roundDown(lo), high: roundUp(hi), minimumApplied: scenario(0) * r.range_low < min
    };
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  const api = { ratesFromRows: ratesFromRows, priceBid: priceBid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SGBids = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
