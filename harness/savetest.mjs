/* ============================================================================
   savetest — the save code, and everything it has to carry.

   A save code IS the character. `saveObject()` is shared by the autosave and by
   the ALDV export code, so anything it forgets is lost twice: on every logout,
   and again when a player pastes their code into a new browser expecting to find
   themselves. That has already happened — the Gauntlet's best wave was written
   on every new record and thrown away at logout, because nothing saved it.

   The failure mode is silent and structural: a system gets added (Construction,
   Agility, the ore pouch, the cottage), its state lands on `player`, and nobody
   remembers the THREE places that field has to appear —

       saveObject()  writes it   ->   loadSlot()  reads it   ->   resetGame() clears it

   So this harness does not just round-trip a character. It reads the source and
   asserts the three lists agree, and that EVERY `player.*` field in the whole
   game is either saved or on the transient allowlist below. Adding a persistent
   field without saving it fails here, by name, with the fix in the message.

   Run: node harness/savetest.mjs
   ========================================================================== */
import {runPass, Suite, PRELUDE, SRC} from './_lib.mjs';

/* ---------------------------------------------------------------------------
   THE TRANSIENT ALLOWLIST — `player.*` fields that are deliberately NOT saved.
   Each is session state that must not survive a logout. If you are here because
   a new name failed the check, decide which list it belongs on: put it in
   saveObject()/loadSlot()/resetGame(), or add it here with the reason.
   ------------------------------------------------------------------------ */
const TRANSIENT = new Set([
  /* where you are standing THIS tick — x/y are saved, the rest is interpolation */
  'px', 'py', 'face', 'heading', 'path', 'target', 'cmb',
  /* what you are doing right now */
  'action', 'actTick', 'buildT', 'chat', 'chatT', 'emote', 'emoteFx', 'emoteT',
  /* combat timers and one-shot flags, all rebuilt on the next swing */
  'combatT', 'nextAtk', 'swingT', 'braceT', 'specCdT', 'frozenUntil', 'regen',
  '_bloodFury', '_tele', '_fly', '_flx', '_slideT', '_slideMsgT', '_agiAnim', '_skT',
  /* fractional regen accumulators — sub-point, meaningless across a session */
  '_hpAcc', '_prAcc',
  /* stat boosts: OSRS-style, they drain in real time and do not survive a logout */
  'boosts',
  /* mid-lap agility progress: an unfinished lap does not bank */
  'agiSeq',
  /* performance.now()-relative, so meaningless in a later session */
  'furnaceUntil', 'lavaT', 'lavaMsgT', 'coldT', 'coldMsgT',
  /* chat-spam cooldowns: re-warn once per session is the intent */
  '_dnMsgT', '_fzMsgT', '_noammoT', '_badammoT', '_norunesT', '_nospellT', '_lowmagT',
  '_pouchDrawT', '_sawCrabSign', '_petTuckT', '_petBlockKey', '_alchMode',
]);

/* Fields the round-trip compares loosely, with the reason. Everything else must
   come back byte-identical. */
const LOOSE = {
  collected: 'backfillCollected() ADDS what you are carrying, so it may grow on load',
};

const T = runPass(PRELUDE + String.raw`
  /* a walkable outdoor tile, so the "did you log out somewhere legal" guard in
     loadSlot does not bounce us to the square and mask a real x/y failure */
  let HX = 89 + WX, HY = 88;

  /* ---------------- build a character with progress in every system --------- */
  function loadUpCharacter(){
    player.name = 'Roundtrip'; player.uid = 'u_rt_1';
    for(const sk of SKILLS) player.skills[sk] = XP_TABLE[70];
    player.skills.agility = XP_TABLE[62];        /* both added AFTER the save code existed */
    player.skills.construction = XP_TABLE[84];
    player.skills.prayer = XP_TABLE[120];        /* the 100-point clamp bug lived here */
    player.hp = 41; player.pray = 118; player.stamina = 57; player.run = true;
    player.x = HX; player.y = HY; player.px = HX; player.py = HY;
    clearInv(); give('coins', 1234567); give('bronze_sword', 1);
    /* ONE OF EVERY ITEM IN THE GAME, so an item added this week is covered too */
    bank.length = 0;
    for(const id of Object.keys(ITEMS)) bank.push({id, qty: ITEMS[id].stack ? 7 : 1});
    player.equip = {weapon:{id:'bronze_sword',qty:1}, shield:{id:'bronze_kiteshield',qty:1}, cape:null, ammo:null};
    player.kit = true; player.style = 'slash'; player.autoRetaliate = false; player.autocast = 'wind';
    player.titleUnlocks = {merry:true}; player.title = 'merry'; player.emoteUnlocks = {cheer:true};
    player.maxHit = 41; player.maxMagicHit = 22; player.maxRangeHit = 19;
    player.deaths = 7; player.pvpWins = 3; player.bossKills = 12; player.bratKills = 4;
    player.kills = 904; player.kcBy = {rat:100}; player.achDone = {first_blood:1};
    player.playMs = 987654; player.delves = 6; player.shrimpBurned = 15; player.cluesDone = 9;
    player.clueData = {active:{step:2}}; player.cageMaps = {a:1};
    player.sosKills = [1,2,3]; player.sosCleared = [1];
    player.lostStash = [{id:'coins',qty:99}]; player.friends = ['Bob'];
    player.partyQuiz = true; player.winterUnlocked = true; player.winter = true;
    player.fall = false; player.fallUnlocked = true;
    player.rectorKilledAt = 1700000000000;
    player.emberOrder = {a:1}; player.emberBounty = {b:2}; player.emberVaultDone = true;
    player.emberPipes = {p:1}; player.emberPipesDone = {q:1}; player.emberDrained = {};
    player.swensonFixed = true; player.swensonOrders = 5; player.swenOrder = {o:1};
    player.pouch = {unlocked:true, cap:100, ore:{iron_ore:20}, auto:false};
    player.cosmetic = {hairstyle:'long', hair:1, shirt:2, pants:3, shirtStyle:'tee', pantsStyle:'trousers'};
    player.tutorial = {step:9, done:true, active:false, sub:0};
    player.pet = {wasId:'pet_rat', vig:5, saved:5};
    player.mmf = {fish:0, mine:0, smith:0, bank:0, altar:0, quest:0, shop:0};
    player.quests.chef.s = 4; player.quests.m5.s = 1; player.quests.ember.s = 2;
    player.slayer = {task:'rat', need:20, done:5, streak:11, points:220, tasksDone:11,
                     unlocks:{u:1}, blocked:{b:1}};
    player.collected = {coins:1};
    player.gauntletBest = 8;
    player._starterKit = 1;
    musicSel = 3; musicManual = true;
    _vaultSolved.memory = true; _vaultSolved.lockout = true;
    _vaultSolved.cells = true; _vaultSolved.web = true;
    _vaultCleared = true;
  }

  /* ---- a REAL cottage, built through the game's own API, not a hand literal ---- */
  setLevel('construction', 99);
  clearInv(); give('coins', 20000000);
  freshHouse();
  for(const [gx, gy, t] of [[0,0,'kitchen'], [2,0,'bedroom'], [0,1,'workshop'], [1,1,'garden']])
    houseBuildRoom(gx, gy, t);
  for(const [key, fid] of [['1,0:hearth','hf_hearth'], ['0,0:range','hf_clayoven'], ['2,0:bed','hf_oakbed']]){
    const F = HOUSE_FURNITURE[fid];
    give(F.plankId || 'oak_plank', F.planks|0); give('iron_nails', F.nails|0);
    houseBuild(key, fid);
  }
  player.house.servant ={tier:'butler', hiredAt:1700000000000, tripEndsAt:0, pending:null};
  const HOUSE_BUILT = JSON.parse(JSON.stringify(player.house));
  o.houseRooms = Object.keys(houseRooms()).length;
  o.houseSlots = Object.keys(houseSlots()).length;
  try{ exitHouse(); }catch(e){}
  houseVisit = null;

  loadUpCharacter();
  player.house = JSON.parse(JSON.stringify(HOUSE_BUILT));
  /* DEEP-COPY THE SNAPSHOT. saveObject() hands back LIVE references (bank, player.inv,
     player.collected, player.house are the objects themselves, not copies) -- which is fine for its
     two callers, both of which stringify it on the spot, but means the wipe below would otherwise
     scribble over the very thing we are comparing against. */
  const BEFORE_JSON = JSON.stringify(saveObject());
  const BEFORE = JSON.parse(BEFORE_JSON);
  o.savedKeys = Object.keys(BEFORE).sort();
  o.itemCount = Object.keys(ITEMS).length;
  o.maxPrayThen = maxPray();

  /* ------------- wipe the character between save and load ------------------ */
  function wipe(){
    for(const sk of SKILLS) player.skills[sk] = 0;
    player.inv = new Array(28).fill(null); bank.length = 0;
    player.hp = 1; player.pray = 1; player.stamina = 1; player.run = false;
    player.x = 1; player.y = 1;
    player.equip = {weapon:null, shield:null, cape:null, ammo:null}; player.kit = false;
    player.style = 'stab'; player.autocast = null; player.autoRetaliate = true;
    player.titleUnlocks = {}; player.title = null; player.emoteUnlocks = {};
    player.maxHit = 0; player.maxMagicHit = 0; player.maxRangeHit = 0;
    player.deaths = 0; player.pvpWins = 0; player.bossKills = 0; player.bratKills = 0;
    player.kills = 0; player.kcBy = {}; player.achDone = {};
    player.playMs = 0; player.delves = 0; player.shrimpBurned = 0; player.cluesDone = 0;
    player.clueData = {}; player.cageMaps = {}; player.sosKills = []; player.sosCleared = [];
    player.lostStash = []; player.friends = []; player.partyQuiz = false;
    player.winterUnlocked = false; player.winter = false; player.fall = false; player.fallUnlocked = false;
    player.rectorKilledAt = 0; player.emberOrder = null; player.emberBounty = null;
    player.emberVaultDone = false; player.emberPipes = null; player.emberPipesDone = null;
    player.emberDrained = null;
    player.swensonFixed = false; player.swensonOrders = 0; player.swenOrder = null;
    /* a DEAD ore id in the default pouch: the sweep must clear the LOADED pouch, not this one */
    player.pouch = {unlocked:false, cap:50, ore:{}, auto:true};
    player.cosmetic = null; player.tutorial = null; player.pet = null;
    player.mmf = {fish:1, mine:1, smith:1, bank:1, altar:1, quest:1, shop:1};
    for(const k in player.quests)
      for(const kk in player.quests[k])
        if(typeof player.quests[k][kk] === 'number') player.quests[k][kk] = 0;
    player.slayer = {task:null, need:0, done:0, streak:0, points:0, tasksDone:0, unlocks:{}, blocked:{}};
    player.collected = {}; player.gauntletBest = 0; player._starterKit = 0;
    player.name = 'Wiped'; player.uid = null; player.house = null;
    musicSel = 0; musicManual = false;
    _vaultSolved.memory = false; _vaultSolved.lockout = false;
    _vaultSolved.cells = false; _vaultSolved.web = false;
    _vaultCleared = false;
  }

  o.p = (async function(){
    const r = {};

    /* ---------------- 1. encode / decode ---------------- */
    const code = await encodeSave(BEFORE_JSON);
    r.codeLen = code.length;
    r.gzipped = code.slice(0, 6) === 'ALDV1:';
    r.smallerThanRaw = code.length < BEFORE_JSON.length;
    r.decodeExact = (await decodeSave(code)) === BEFORE_JSON;

    /* the uncompressed fallback path still reads */
    const raw = 'ALDV0:' + saveCodeBytesToB64(new TextEncoder().encode(BEFORE_JSON));
    r.v0Decodes = (await decodeSave(raw)) === BEFORE_JSON;

    /* a code that has been through a chat window, a phone keyboard and a copy box */
    const mangled = [
      '  ' + code + '  ',
      code.slice(0, 40) + '\n' + code.slice(40),
      code.replace('ALDV1:', 'aldv1:'),
      code.replace('ALDV1:', 'ALDV1∶'),          /* smart-punctuated colon */
      'my save code is ' + code,
    ];
    r.mangledOK = [];
    for(const m of mangled){
      try{ r.mangledOK.push((await decodeSave(m)) === BEFORE_JSON); }
      catch(e){ r.mangledOK.push(String(e.message || e)); }
    }
    /* and rubbish is refused rather than half-applied */
    r.rubbishRefused = 0;
    for(const bad of ['', 'hello', 'ALDV1:@@@@', 'ALDV0:' + 'A'.repeat(40)]){
      try{ const j = await decodeSave(bad); if(!validSave(JSON.parse(j))) r.rubbishRefused++; }
      catch(e){ r.rubbishRefused++; }
    }

    /* ---------------- 2. the round trip onto a wiped character -------------- */
    const back = JSON.parse(await decodeSave(code));
    wipe();
    r.loaded = await loadSlot('savetest', back);
    const AFTER = saveObject();
    r.diffs = [];
    for(const k of Object.keys(BEFORE)){
      const a = JSON.stringify(BEFORE[k]), b = JSON.stringify(AFTER[k]);
      if(a !== b) r.diffs.push(k + ': saved ' + String(a).slice(0, 70) + ' -> reloaded ' + String(b).slice(0, 70));
    }
    /* collected is allowed to GROW (backfill), never to lose an entry */
    r.collectedKept = Object.keys(BEFORE.collected).every(k => AFTER.collected[k]);

    /* ---------------- 3. the things that were actually broken --------------- */
    r.skillsBack = {}; for(const sk of SKILLS) r.skillsBack[sk] = player.skills[sk];
    r.agiLevel = levelFor(player.skills.agility);
    r.conLevel = levelFor(player.skills.construction);
    r.prayKept = player.pray;                 /* was clamped to 100 with a 120 Prayer pool */
    r.maxPrayNow = maxPray();
    r.gauntletBest = player.gauntletBest;     /* was never saved at all */
    r.starterKit = player._starterKit;
    r.invLen = player.inv.length;
    r.bankLen = bank.length;
    r.houseRoomsBack = Object.keys(houseRooms()).length;
    r.houseSlotsBack = Object.keys(houseSlots()).length;
    r.houseServant = JSON.stringify(player.house.servant);
    r.houseRepair = player.house.repair;
    r.itemsKept = bank.filter(e => e && ITEMS[e.id]).length;

    /* ---------------- 4. an OLD save, from before the newest skills ---------- */
    const old = JSON.parse(JSON.stringify(back));
    delete old.skills.agility; delete old.skills.construction;
    delete old.gauntletBest; delete old.pouch; delete old.house; delete old.pet;
    await loadSlot('savetest_old', old);
    r.oldAgility = player.skills.agility;
    r.oldConstruction = player.skills.construction;
    r.oldAgilityLevel = levelFor(player.skills.agility);
    r.oldNoNaN = SKILLS.every(sk => isFinite(player.skills[sk]));
    r.oldPouchOK = !!(player.pouch && player.pouch.ore && player.pouch.cap === 50);

    /* ---------------- 5. the pouch sweep runs on the LOADED pouch ------------ */
    const dead = JSON.parse(JSON.stringify(back));
    dead.pouch = {unlocked:true, cap:100, ore:{iron_ore:20, elixir_of_nothing:9}, auto:true};
    await loadSlot('savetest_dead', dead);
    r.deadOreSwept = !('elixir_of_nothing' in player.pouch.ore);
    r.liveOreKept = player.pouch.ore.iron_ore;

    /* ---------------- 6. a truncated pack is normalised --------------------- */
    const short = JSON.parse(JSON.stringify(back));
    short.inv = [{id:'coins', qty:5}];
    await loadSlot('savetest_short', short);
    r.shortInvLen = player.inv.length;
    r.shortInvKept = player.inv[0] && player.inv[0].id;

    /* ---------------- 7. reset really resets -------------------------------- */
    await loadSlot('savetest_reset', back);
    await resetGame();
    const RESET = saveObject();
    r.resetLeftovers = [];
    const KEEP = new Set(['name', 'uid', 'musicSel', 'musicManual', 'mapv', 'xpv', 'mhr',
                          'x', 'y', 'hp', 'pray', 'stamina', 'hin', 'inv', 'bank']);
    for(const k of Object.keys(BEFORE)){
      if(KEEP.has(k)) continue;
      const fresh = JSON.stringify(RESET[k]);
      if(fresh === JSON.stringify(BEFORE[k]) && fresh !== 'null' && fresh !== '0' &&
         fresh !== 'false' && fresh !== '{}' && fresh !== '[]')
        r.resetLeftovers.push(k + ' = ' + String(fresh).slice(0, 60));
    }
    r.resetHouse = RESET.house;
    r.resetInvEmpty = RESET.inv.every(s => !s);
    r.resetBankEmpty = bank.length === 0;
    r.resetQuestChef = player.quests.chef.s;
    r.resetSlayerStreak = player.slayer.streak;
    r.resetSkillsZero = SKILLS.filter(sk => sk !== 'hitpoints').every(sk => player.skills[sk] === 0);
    r.resetHpFloor = player.skills.hitpoints === XP_TABLE[10];
    r.resetGauntlet = player.gauntletBest;

    return r;
  })();

  return o;
`);

const S = new Suite('savetest');
S.guard(T);
const R = await T.p;

/* ========================== the code itself ============================== */
S.ok('a save code round-trips byte-for-byte',        R.decodeExact);
S.ok('  and is gzipped (ALDV1)',                     R.gzipped);
S.ok('  smaller than the raw JSON',                  R.smallerThanRaw, `${R.codeLen} chars`);
S.ok('  the uncompressed ALDV0 fallback still reads', R.v0Decodes);
S.eq('a mangled code still loads (spaces, wraps, lowercase, smart colon, prose)',
     R.mangledOK, [true, true, true, true, true]);
S.eq('  and rubbish is refused, not half-applied',   R.rubbishRefused, 4);

/* ======================= the character comes back ======================== */
S.ok('loadSlot accepted the decoded save',           R.loaded);
const strictDiffs = R.diffs.filter(d => !Object.keys(LOOSE).some(k => d.startsWith(k + ':')));
S.eq('EVERY saved field comes back unchanged',       strictDiffs, []);
S.ok('  and the collection log keeps what it had',   R.collectedKept);
S.eq('  the pack is 28 slots',                       R.invLen, 28);
S.eq('  the bank came back whole',                   R.bankLen, T.itemCount);
S.eq('  every item id in the game survives the trip', R.itemsKept, T.itemCount);

/* ================= the skills added after the save code ================== */
S.eq('agility survives at the level it was saved',    R.agiLevel, 62);
S.eq('  and construction',                           R.conLevel, 84);
S.ok('  all 16 skills come back finite',             Object.keys(R.skillsBack).length === 16 &&
     Object.values(R.skillsBack).every(v => isFinite(v)), JSON.stringify(R.skillsBack));
S.ok('an OLD save with no agility/construction backfills to 0, not NaN',
     R.oldAgility === 0 && R.oldConstruction === 0 && R.oldNoNaN);
S.eq('  and reads as level 1',                       R.oldAgilityLevel, 1);
S.ok('  an old save with no pouch gets a default one', R.oldPouchOK);

/* ============================== the cottage ============================== */
S.eq('every room built survives the trip',           R.houseRoomsBack, T.houseRooms);
S.eq('  and every piece of furniture',               R.houseSlotsBack, T.houseSlots);
S.eq('  and the repair stage',                       R.houseRepair, 3);
S.ok('  and the butler',                             /butler/.test(R.houseServant), R.houseServant);

/* ==================== the bugs this harness was written for ============== */
S.ok('PRAYER IS NOT DOCKED TO 100 ON LOAD',          R.prayKept === 118,
     `pool ${R.maxPrayNow}, loaded in at ${R.prayKept}`);
S.eq('THE GAUNTLET RECORD SURVIVES A LOGOUT',        R.gauntletBest, 8);
S.eq('  and the starter kit is not re-granted',      R.starterKit, 1);
S.ok('A DEAD ORE ID IS SWEPT FROM THE LOADED POUCH', R.deadOreSwept);
S.eq('  and live ore is left alone',                 R.liveOreKept, 20);
S.eq('a truncated pack is padded back to 28',        R.shortInvLen, 28);
S.eq('  keeping what it carried',                    R.shortInvKept, 'coins');

/* ============================ reset progress ============================= */
S.eq('resetGame leaves nothing the save carried',    R.resetLeftovers, []);
S.eq('  the cottage is gone',                        R.resetHouse, null);
S.ok('  the pack and bank are empty',                R.resetInvEmpty && R.resetBankEmpty);
S.eq('  quests are back to the start',               R.resetQuestChef, 0);
S.eq('  the slayer streak is gone',                  R.resetSlayerStreak, 0);
S.ok('  skills are zeroed with hitpoints at its floor',
     R.resetSkillsZero && R.resetHpFloor);
S.eq('  the Gauntlet record is cleared',             R.resetGauntlet, 0);

/* ==================== SOURCE: the three lists agree ====================== */
const SAVE_SRC  = SRC.slice(SRC.indexOf('function saveObject()'), SRC.indexOf('function saveCodeBytesToB64'));
const LOAD_SRC  = SRC.slice(SRC.indexOf('async function loadSlot'), SRC.indexOf('function newSlot(name)'));
const RESET_SRC = SRC.slice(SRC.indexOf('async function resetGame()'), SRC.indexOf('/* =============================== UI ='));

/* every field saveObject() writes must be read back by loadSlot() */
const savedTop = T.savedKeys.filter(k => !['mapv', 'xpv', 'mhr', 'hin', 'raidSess', 'volc'].includes(k));
const unread = savedTop.filter(k => !new RegExp('\\bs\\.' + k + '\\b').test(LOAD_SRC));
S.eq('every saved field is read back by loadSlot',   unread, []);

/* every player.* field in the game is saved, or is on the transient allowlist */
const playerFields = new Set();
for(const m of SRC.matchAll(/player\.([A-Za-z_][A-Za-z0-9_]*)/g)) playerFields.add(m[1]);
const savedFields = new Set();
for(const m of SAVE_SRC.matchAll(/player\.([A-Za-z_][A-Za-z0-9_]*)/g)) savedFields.add(m[1]);
const unaccounted = [...playerFields].filter(k => !savedFields.has(k) && !TRANSIENT.has(k)).sort();
S.eq('EVERY player.* field is saved or declared transient', unaccounted, [],
     'add it to saveObject()+loadSlot()+resetGame(), or to TRANSIENT at the top of this file');

/* resetGame must clear everything saveObject saves — the source check catches a
   field that the runtime check above cannot reach (one whose fresh value happens
   to equal the loaded one) */
/* `_?` because several saved fields live on an underscored global or player key —
   vaultSolved is `_vaultSolved`, starterKit is `player._starterKit` */
const resetMisses = savedTop.filter(k => !new RegExp('\\b_?' + k + '\\b').test(RESET_SRC)
                                      && !['name', 'musicSel', 'musicManual', 'bank', 'inv', 'hp'].includes(k));
S.eq('resetGame names every saved field',            resetMisses, [],
     'reset is the mirror of the save: what is worth carrying is worth clearing');

/* the save keys are frozen forever (docs/00) */
S.ok("the storage keys are unchanged",
     /aldervale-slots-v1/.test(SRC) && /'aldervale-save-'/.test(SRC));
S.ok("  and both code prefixes still exist",
     /'ALDV1:'/.test(SRC) && /'ALDV0:'/.test(SRC));

for(const k in LOOSE) S.note(`${k} is compared loosely — ${LOOSE[k]}`);

S.report(
  'A save code carries the whole character: all 16 skills, every item in the game, the cottage with '
  + 'its rooms/furniture/butler, quests, slayer, Emberdeep, the pet, the pouch and the cosmetics — '
  + 'and comes back byte-identical. saveObject/loadSlot/resetGame are asserted to agree field for field.',
  'the export/import BUTTONS and the clipboard — the modal, the paste box and navigator.clipboard '
  + 'need a browser; only the encode/decode underneath them is proven here.');
