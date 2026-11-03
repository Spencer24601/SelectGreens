// Select Greens estimator. Prices a job the way the bidder does: cost lines, divided by
// (1 - margin), then site adjustments and customer-priced add-ons. Cost lines and margin are
// never shown on the page. Values marked CONFIRM are placeholders until the bidder checks them.
(function (root) {
  const MODEL = {
    margin: 0.35,
    waste: 1.10,                       // turf bought per sq ft laid (seams, odd shapes)
    turfRate:  { lawn: { standard: 2.00, premium: 3.00, platinum: 7.00 },
                 green: { standard: 9.50, premium: 12.50 } },          // green: CONFIRM
    laborRate: { lawn: 2.95, green: 5.90 },                            // green is 2x: CONFIRM
    baseCost:  0.48,                   // $/sq ft, Standard 3" base
    baseAdd:   { standard: 0, thick: 0.50, max: 1.25 },                // CONFIRM
    sodDisposal: 0.625,                // $/sq ft when sod is removed
    infillBagCost: 12.10,
    infillSqftPerBag: 25,
    coloredInfillPerBag: 25,           // charged on top, outside the margin
    materials: 0.44,                   // $/sq ft: nails, seam tape, weed barrier
    equipment: 0.625,                  // $/sq ft (was $500 flat; a flat fee made 250 sq ft jobs too high)
    edgingPerFoot: { none: 0, wood: 3, metal: 4, paver: 5 },           // CONFIRM, outside the margin
    cupPrice: 250,                     // $ per cup, outside the margin (bidder: $150-$300 each)
    minimum:   { lawn: 2500, green: 4250 },                            // CONFIRM
    slope:     { mild: [0, 0], steep: [0.10, 0.25] },                  // % of price
    clay:      [0.50, 1.50],                                           // $/sq ft added to price
    wheelbarrow: [0.15, 0.30],                                         // % added to labor
    low: 0.95,                         // range shown: price x 0.95 ...
    high: 1.15                         //   ... to price x 1.15 (bids land within 10-20%)
  };

  const roundDown = (n) => Math.floor(n / 50) * 50;
  const roundUp = (n) => Math.ceil(n / 50) * 50;

  // cfg: { type, tier, sqft, base, sodCut, edging, edgingFeet, colored, slope, clay, wheelbarrow, cups }
  function estimate(cfg, m) {
    m = m || MODEL;
    const sqft = cfg.sqft;
    const type = cfg.type;
    const bags = Math.ceil(sqft / m.infillSqftPerBag);
    const feet = cfg.edging === 'none' ? 0 : (cfg.edgingFeet > 0 ? cfg.edgingFeet : Math.round(4 * Math.sqrt(sqft)));

    const labor = sqft * m.laborRate[type];
    const costExLabor =
      sqft * m.waste * m.turfRate[type][cfg.tier] +
      sqft * (m.baseCost + m.baseAdd[cfg.base]) +
      (cfg.sodCut ? sqft * m.sodDisposal : 0) +
      bags * m.infillBagCost +
      sqft * m.materials +
      sqft * m.equipment;

    const addOns =
      feet * m.edgingPerFoot[cfg.edging] +
      (cfg.colored ? bags * m.coloredInfillPerBag : 0) +
      (type === 'green' ? (cfg.cups || 0) * m.cupPrice : 0);

    // idx 0 = low end of every stated range, idx 1 = high end
    const scenario = (i) => {
      const laborAdj = cfg.wheelbarrow ? 1 + m.wheelbarrow[i] : 1;
      let price = (costExLabor + labor * laborAdj) / (1 - m.margin);
      if (cfg.clay) price += sqft * m.clay[i];
      price *= 1 + m.slope[cfg.slope][i];
      return price + addOns;
    };

    let lo = scenario(0) * m.low;
    let hi = Math.max(scenario(1), scenario(0) * m.high);
    const min = m.minimum[type];
    lo = Math.max(lo, min);
    hi = Math.max(hi, min * m.high);
    return { low: roundDown(lo), high: roundUp(hi), edgingFeet: feet, bags: bags };
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { MODEL: MODEL, estimate: estimate };
    return;
  }
  root.SGEstimator = { MODEL: MODEL, estimate: estimate };

  // ---------- Page wiring (estimate.html only) ----------
  const projType = document.getElementById('projType');
  if (!projType) return;

  const tiers = {
    lawn: [
      { value: 'standard', label: 'Everyday Lawn — Trek 50' },
      { value: 'premium',  label: 'Elevated Lawn — Arizona Pro' },
      { value: 'platinum', label: 'Top-Tier Lawn — Natural Fusion Patriot' }
    ],
    green: [
      { value: 'standard', label: 'Standard Green' },
      { value: 'premium',  label: 'Premium Green' }
    ]
  };
  const $ = (id) => document.getElementById(id);
  const sqftRange = $('sqftRange'), turfTier = $('turfTier'), baseTier = $('baseTier'), sodCut = $('sodCut'),
        edging = $('edging'), edgingFeet = $('edgingFeet'), edgingFeetField = $('edgingFeetField'),
        infill = $('infill'), slope = $('slope'), soil = $('soil'), access = $('access'),
        cups = $('cups'), cupsField = $('cupsField'), maintProgram = $('maintProgram'),
        estRange = $('estRange'), estBreakdown = $('estBreakdown');
  const label = (sel) => sel.options[sel.selectedIndex].text.split(' — ')[0];
  const money = (n) => '$' + n.toLocaleString('en-US');

  function config() {
    return {
      type: projType.value, tier: turfTier.value, sqft: parseInt(sqftRange.value, 10), base: baseTier.value,
      sodCut: sodCut.value === 'sodcut', edging: edging.value, edgingFeet: parseInt(edgingFeet.value, 10) || 0,
      colored: infill.value === 'green', slope: slope.value, clay: soil.value === 'clay',
      wheelbarrow: access.value === 'wheelbarrow', cups: projType.value === 'green' ? Math.max(0, parseInt(cups.value, 10) || 0) : 0
    };
  }

  function summaryLines(cfg, r) {
    const lines = [
      ['Area', cfg.sqft + ' sq ft'],
      ['Turf', turfTier.options[turfTier.selectedIndex].text],
      ['Road base', label(baseTier)]
    ];
    if (cfg.sodCut) lines.push(['Sod removal', 'Included']);
    if (cfg.edging !== 'none') lines.push(['Edging', label(edging) + ', about ' + r.edgingFeet + ' ft']);
    lines.push(['Infill', label(infill)]);
    if (cfg.slope === 'steep') lines.push(['Slope', 'Steep']);
    if (cfg.clay) lines.push(['Soil', 'Clay']);
    if (cfg.wheelbarrow) lines.push(['Access', 'Wheelbarrow only']);
    if (cfg.type === 'green') {
      if (cfg.cups > 0) lines.push(['Cups', String(cfg.cups)]);
      lines.push(['Fringe', 'Quoted separately']);
    }
    if (maintProgram.checked) lines.push(['Maintenance program', 'Quoted separately']);
    return lines;
  }

  function calc() {
    $('sqftLabel').textContent = sqftRange.value;
    edgingFeetField.style.display = edging.value === 'none' ? 'none' : '';
    cupsField.style.display = projType.value === 'green' ? '' : 'none';
    const cfg = config();
    const r = estimate(cfg);
    estRange.textContent = money(r.low) + '–' + r.high.toLocaleString('en-US');
    const lines = summaryLines(cfg, r);
    estBreakdown.innerHTML = lines.map((l) => '<div><span>' + l[0] + '</span><span>' + l[1] + '</span></div>').join('');
    return { cfg: cfg, lines: lines };
  }

  function populateTiers() {
    turfTier.innerHTML = tiers[projType.value].map((o) => '<option value="' + o.value + '">' + o.label + '</option>').join('');
  }

  populateTiers();
  projType.addEventListener('change', () => { populateTiers(); calc(); });
  [sqftRange, turfTier, baseTier, sodCut, edging, edgingFeet, infill, slope, soil, access, cups, maintProgram]
    .forEach((el) => el.addEventListener('input', calc));
  calc();

  // Quote form flow: the estimate stays locked until the lead form is submitted
  const quoteForm = $('quoteForm'), leadForm = $('leadForm'), confirmPanel = $('confirmPanel');
  $('openQuoteBtn').addEventListener('click', (e) => {
    e.preventDefault();
    quoteForm.classList.add('open');
    quoteForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const state = calc();
    $('estimatedRangeField').value = estRange.textContent;
    $('estimateSummaryField').value = state.lines.map((l) => l[0] + ': ' + l[1]).join('\n');
    $('projectConfigField').value = JSON.stringify(state.cfg);

    const wantsCopy = $('emailCopy').checked;
    const email = leadForm.elements['email'].value;
    const unlock = () => {
      leadForm.style.display = 'none';
      confirmPanel.classList.add('open');
      if (wantsCopy) confirmPanel.querySelector('p').textContent =
        'Your estimate is unlocked below, and we are emailing a copy to ' + email + '. We’ll follow up directly. Typical response time is one business day.';
      $('estLocked').style.display = 'none';
      $('estUnlocked').style.display = 'block';
    };
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(new FormData(leadForm)).toString()
    }).then(unlock).catch(unlock);
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
