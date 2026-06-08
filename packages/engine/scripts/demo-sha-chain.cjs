/**
 * 验收：【杀】→ 不闪 → 伤害 → 奸雄（配置触发）
 * 运行：npm run build -w @tk/engine && node packages/engine/scripts/demo-sha-chain.cjs
 */
const { SangokushiEngine } = require('../dist/index.js');

function player(id, seat, name, general, hand) {
  return {
    id,
    seat,
    nickname: name,
    generalId: general,
    generalName: general,
    role: 'player',
    kingdom: 'wei',
    hp: 4,
    maxHp: 4,
    handCards: hand,
    equipment: [],
    judgeCards: [],
    shaUsedCount: 0,
    skillUseCount: {},
  };
}

async function main() {
  const attacker = player('p1', 1, '关羽', '界关羽', ['杀', '闪']);
  const victim = player('p2', 2, '曹操', '界曹操', ['闪', '桃']);

  const engine = new SangokushiEngine({ players: [attacker, victim] });

  let r = engine.initiatePlayCard('p1', '杀', 0);
  console.log('initiate', r);

  r = await engine.confirmPlayCard('p1', engine.getState().prompt.id);
  console.log('confirm', r);

  r = await engine.selectTargets('p1', engine.getState().prompt.id, ['p2']);
  console.log('targets', r);

  const prompt = engine.getState().prompt;
  console.log('response:', prompt?.message);

  r = await engine.submitPromptChoice('p2', prompt.id, 'pass');
  console.log('pass', r);

  if (engine.getState().prompt?.type === 'use_skill') {
    console.log('skill prompt:', engine.getState().prompt.message);
    r = await engine.submitPromptChoice(
      'p2',
      engine.getState().prompt.id,
      'skill:jianxiong',
    );
    console.log('jianxiong', r);
  }

  const st = engine.getState();
  console.log('victim hp:', st.players[1].hp);
  console.log('victim hand:', st.players[1].handCards);
  console.log('--- log ---');
  st.log.slice(0, 10).forEach((l) => console.log(l));
}

main().catch(console.error);
