// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CosmoBankVault
 * @notice „Bank" Cosmic Lands — zamyka COSMO + NFT deed jako NIEPORUSZALNĄ
 *         płynność (liquidity) na czas >= unlockTime. Wpłaty (deposit) otwarte,
 *         wypłaty (withdraw) tylko dla ownera (Safe multisig) PO unlockTime.
 *         Przed unlockTime żadna wypłata nie przejdzie — blokada w protokole,
 *         nie tylko organizacyjna.
 *
 * @dev Owner = Safe multisig (2/3). unlockTime = block.timestamp + lata*365d.
 *      Deploy: po tokenomice v2 — pula Bank+Liquidity 9 280 000 (rezerwat)
 *      + nadwyżka elastyczna 4 083 200 (K 18.08).
 */
contract CosmoBankVault is Ownable, IERC721Receiver {
    IERC20 public immutable cosmo;
    IERC721 public immutable deed;
    uint256 public immutable unlockTime;

    bytes4 private constant _ERC721_RECEIVED = IERC721Receiver.onERC721Received.selector;

    event DepositedCosmo(address indexed from, uint256 amount);
    event DepositedDeed(address indexed from, uint256 tokenId);
    event WithdrawnCosmo(address indexed to, uint256 amount);
    event WithdrawnDeed(address indexed to, uint256 tokenId);

    constructor(address _cosmo, address _deed, uint256 _unlockTime)
        Ownable(msg.sender)
    {
        require(_cosmo != address(0) && _deed != address(0), "zero address");
        cosmo = IERC20(_cosmo);
        deed = IERC721(_deed);
        unlockTime = _unlockTime;
    }

    modifier onlyAfterUnlock() {
        require(block.timestamp >= unlockTime, "vault locked until unlockTime");
        _;
    }

    /** Wpłata COSMO do banku — otwarta dla każdego (np. treasury worker). */
    function depositCosmo(uint256 amount) external {
        require(amount > 0, "zero amount");
        require(cosmo.transferFrom(msg.sender, address(this), amount), "transfer failed");
        emit DepositedCosmo(msg.sender, amount);
    }

    /** Wpłata NFT deed do banku — deed musi być transferowalny (komercyjny lub odblokowany). */
    function depositDeed(uint256 tokenId) external {
        deed.transferFrom(msg.sender, address(this), tokenId);
        emit DepositedDeed(msg.sender, tokenId);
    }

    /** Wypłata COSMO — tylko owner (multisig) i tylko po unlockTime. */
    function withdrawCosmo(address to, uint256 amount) external onlyOwner onlyAfterUnlock {
        require(amount > 0 && amount <= cosmo.balanceOf(address(this)), "invalid amount");
        require(cosmo.transfer(to, amount), "transfer failed");
        emit WithdrawnCosmo(to, amount);
    }

    /** Wypłata NFT — tylko owner (multisig) i tylko po unlockTime. */
    function withdrawDeed(address to, uint256 tokenId) external onlyOwner onlyAfterUnlock {
        require(deed.ownerOf(tokenId) == address(this), "not in vault");
        deed.transferFrom(address(this), to, tokenId);
        emit WithdrawnDeed(to, tokenId);
    }

    function cosmoBalance() external view returns (uint256) {
        return cosmo.balanceOf(address(this));
    }

    function deedOwner(uint256 tokenId) external view returns (address) {
        return deed.ownerOf(tokenId);
    }

    function lockedFor() external view returns (uint256) {
        return unlockTime > block.timestamp ? unlockTime - block.timestamp : 0;
    }

    /**
     * Bank przyjmuje NFT (safe mint/deposit rezerwatu prosto na vault).
     * Zwraca selector, akceptując każdy deed — blokady pilnuje sam kontrakt
     * deed (transfer przed unlockAt REVERTuje) oraz onlyAfterUnlock przy wypłatach.
     */
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return _ERC721_RECEIVED;
    }
}
