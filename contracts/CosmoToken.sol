// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

/**
 * @title CosmoToken
 * @notice COSMO utility/collector token (Base L2). Minted by owner (backend worker)
 * as grant on purchase. Not an investment vehicle; utility bonus only.
 */
contract CosmoToken is ERC20, ERC20Burnable, Ownable {
    uint256 public constant MAX_SUPPLY = 58_000_000e18; // sztywna emisja 58M (K 18.08) — zero dodruku

    constructor(uint256 initialSupply) ERC20("COSMO", "COSMO") Ownable(msg.sender) {
        require(initialSupply <= MAX_SUPPLY, "initial supply > cap");
        _mint(msg.sender, initialSupply);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "cap exceeded");
        _mint(to, amount);
    }

    // Mint jest dozwolony tylko do osiągnięcia MAX_SUPPLY = 58M; po wyczerpaniu emisji
    // kontrakt nie pozwala na żaden dodruk — sztywna podaż wg tokenomiki v2 (K 18.08).
}