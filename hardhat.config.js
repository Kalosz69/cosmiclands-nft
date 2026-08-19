// hardhat.config.js — ESM (package.json ma "type": "module"). Minimalny config do testów runtime.
// Użycie: npx hardhat test test/lock-runtime-hardhat.js
export default {
  solidity: {
    version: '0.8.29',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    hardhat: {
      type: 'edr-simulated',
      hardfork: 'cancun',
      chainId: 84532,
    },
  },
  mocha: { timeout: 60000 },
};
