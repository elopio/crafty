const Crafty = artifacts.require('Crafty');
const DetailedMintableToken = artifacts.require('DetailedMintableToken');

const axios = require('axios');
const capitalize = require('capitalize');
const fs = require('fs');
const unvowel = require('unvowel');

const API = 'https://wrbirbjyzf.execute-api.us-east-2.amazonaws.com/api/crafty';

const canonicals = [
  {
    name: 'Aragon',
    symbol: 'ANT',
    decimals: 18
  }, {
    name: 'Augur',
    symbol: 'REP',
    decimals: 18
  }, {
    name: 'Decentraland',
    symbol: 'MANA',
    decimals: 18
  }, {
    name: 'Tether',
    symbol: 'USDT',
    decimals: 18
  }, {
    name: 'OmiseGO',
    symbol: 'OMG',
    decimals: 18
  }, {
    name: 'Golem',
    symbol: 'GNT',
    decimals: 18
  }, {
    name: 'Loom Network',
    symbol: 'LOOM',
    decimals: 18
  }, {
    name: 'Mithril',
    symbol: 'MITH',
    decimals: 18
  }, {
    name: 'Power Ledger',
    symbol: 'POWR',
    decimals: 18
  }, {
    name: 'Gnosis',
    symbol: 'GNO',
    decimals: 18
  }
];

async function deploy() {
  const crafty = await deployCrafty();

  await deployCanonicals();

  await deployEmojis(crafty);

  console.log('Deployment successful!');
}

async function deployCrafty() {
  console.log('- Deploying crafty');

  const crafty = await Crafty.new();
  console.log(`Crafty: ${crafty.address}`);

  return crafty;
}

async function deployCanonicals() {
  console.log('- Deploying canonicals');

  await Promise.all(canonicals.map(async canonical => {
    const token = await DetailedMintableToken.new(canonical.name, canonical.symbol, canonical.decimals);
    console.log(`${canonical.name} (${canonical.symbol}): ${token.address}`);
  }));
}

async function deployEmojis(crafty) {
  console.log('- Deploying emojis');

  const emojis = JSON.parse(fs.readFileSync('deploy/assets/emoji-tokens.json', 'utf8'));

  for (let emoji of emojis) { // eslint-disable-line no-await-in-loop
    const picture = fs.readFileSync(`deploy/assets/${emoji.picture}`);
    const imageResponse = await axios.post(`${API}/thumbnail`, {'image-base64': picture.toString('base64')});
    if (imageResponse.status !== 200) {
      throw new Error();
    }

    const rawName = emoji.picture.split(/\./)[0]; // Filename, minus extension
    const name = capitalize(rawName);
    const symbol = `${unvowel.parse(rawName).toUpperCase()}`;

    const metadataResponse = await axios.post(`${API}/metadata`, {
      'name': name,
      'description': emoji.description,
      'image': imageResponse.data
    });

    if (metadataResponse.status !== 200) {
      throw new Error();
    }

    const receipt = await crafty.addCraftable(name, symbol, metadataResponse.data, [], []);
    if (receipt.logs[0].event !== 'CraftableAdded') {
      throw new Error();
    }

    console.log(`${name} (${symbol}): ${receipt.logs[0].args.addr}`);

    // The API is throttled, so we need to sleep to prevent the deployment from going over that limit
    await sleep(500);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = function (cb) {
  deploy().then(cb).catch(cb);
};
