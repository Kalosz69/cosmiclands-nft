// lock-runtime-hardhat.js — RUNTIME test locka rezerwatu (CosmicLandsDeedV2)
// i banku (CosmoBankVault) na lokalnym EVM hardhat (Cancun).
//
// T9a  mint rezerwatu z unlockAt w przyszłości — transfer PRZED czasem REVERT
// T9b  po czasie (evm_increaseTime) — transfer OK
// T9c  setUnlockAt nie może SKRÓCIĆ locka (tylko wydłużyć)
// T10a vault: withdraw przed unlockTime REVERT (COSMO + NFT)
// T10b vault: po czasie withdraw OK
// T10c deed komercyjny (bez locka) — transfer od razu OK
import { ethers } from 'hardhat';
import assert from 'node:assert/strict';

describe('Cosmic Lands — lock rezerwatu + bank (F1)', function () {
  let cosmo, deed, vault, owner, buyer, unlock;

  before(async function () {
    [owner, buyer] = await ethers.getSigners();
    const now = Math.floor(Date.now() / 1000);
    unlock = now + 7200; // test: za 2h; produkcja: 10–50 lat

    const CosmoToken = await ethers.getContractFactory('CosmoToken');
    cosmo = await CosmoToken.deploy(ethers.parseEther('58000000'));

    const DeedV2 = await ethers.getContractFactory('CosmicLandsDeedV2');
    deed = await DeedV2.deploy('ipfs://base/', 10000);

    const Vault = await ethers.getContractFactory('CosmoBankVault');
    vault = await Vault.deploy(await cosmo.getAddress(), await deed.getAddress(), unlock);
  });

  it('T9a: mint rezerwatu — transfer przed unlock REVERT', async function () {
    await deed.mintReserveDeed(buyer.address, 'MARS-RES-000001', 'ipfs://res/1', unlock);
    assert.equal(await deed.lockedUntil(1), BigInt(unlock));
    await assert.rejects(
      deed.connect(buyer).transferFrom(buyer.address, owner.address, 1),
      /deed locked until unlock timestamp/
    );
  });

  it('T9c: setUnlockAt nie może skrócić locka; wydłużenie OK', async function () {
    await assert.rejects(deed.setUnlockAt(1, unlock - 100), /only extend lock/);
    await deed.setUnlockAt(1, unlock + 3600);
    assert.equal(await deed.lockedUntil(1), BigInt(unlock + 3600));
    await deed.setUnlockAt(1, unlock); // przywróć
  });

  it('T10c: deed komercyjny — transfer od razu OK', async function () {
    await deed.mintDeed(buyer.address, 'MARS-PLOT-000001', 'ipfs://com/1');
    await deed.connect(buyer).transferFrom(buyer.address, owner.address, 2);
    assert.equal(await deed.ownerOf(2), owner.address);
  });

  it('T10a: vault — deposit OK, withdraw przed unlockTime REVERT (COSMO)', async function () {
    await cosmo.mint(buyer.address, ethers.parseEther('1000'));
    await cosmo.connect(buyer).approve(await vault.getAddress(), ethers.parseEther('1000'));
    await vault.connect(buyer).depositCosmo(ethers.parseEther('1000'));
    assert.equal(await vault.cosmoBalance(), ethers.parseEther('1000'));
    await assert.rejects(vault.withdrawCosmo(owner.address, ethers.parseEther('10')), /vault locked until unlockTime/);
  });

  it('T10a: vault — zablokowany deed nie wejdzie do vaulta; withdrawDeed REVERT', async function () {
    await assert.rejects(
      (async () => {
        await deed.connect(buyer).approve(await vault.getAddress(), 1);
        await vault.connect(buyer).depositDeed(1);
      })(),
      /deed locked/
    );
    await assert.rejects(vault.withdrawDeed(owner.address, 1), /vault locked until unlockTime/);
  });

  it('T9b: po czasie — transfer rezerwatu OK', async function () {
    await ethers.provider.send('evm_increaseTime', [7300]);
    await ethers.provider.send('evm_mine', []);
    await deed.connect(buyer).transferFrom(buyer.address, owner.address, 1);
    assert.equal(await deed.ownerOf(1), owner.address);
  });

  it('T10b: vault po czasie — withdraw COSMO i NFT OK', async function () {
    await vault.withdrawCosmo(owner.address, ethers.parseEther('1000'));
    assert.equal(await vault.cosmoBalance(), 0n);

    await deed.connect(owner).approve(await vault.getAddress(), 1);
    await vault.depositDeed(1);
    await vault.withdrawDeed(owner.address, 1);
    assert.equal(await deed.ownerOf(1), owner.address);
  });
});
