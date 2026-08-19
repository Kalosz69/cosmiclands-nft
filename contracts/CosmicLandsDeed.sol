// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title CosmicLandsDeed
 * @notice ERC-721 deed for Cosmic Lands plots (Base L2).
 * Mint per plot; tokenId = plot number (global 1..10000) or sequential.
 * Metadata is stored on IPFS (Pinata); tokenURI can be updated by owner.
 */
contract CosmicLandsDeed is ERC721, ERC721URIStorage, Ownable {
    using Strings for uint256;

    uint256 public totalMinted;
    uint256 public maxSupply;
    string public baseURI;

    // plotId (e.g. MARS-PLOT-000001) -> tokenId
    mapping(string => uint256) public plotToToken;
    mapping(uint256 => string) public tokenPlot;

    event DeedMinted(uint256 indexed tokenId, string plotId, address indexed to);
    event BaseURIUpdated(string baseURI);

    constructor(string memory initialBaseURI, uint256 _maxSupply)
        ERC721("Cosmic Lands Deed", "COSMIC")
        Ownable(msg.sender)
    {
        baseURI = initialBaseURI;
        maxSupply = _maxSupply;
    }

    function exists(uint256 tokenId) public view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory _uri) external onlyOwner {
        baseURI = _uri;
        emit BaseURIUpdated(_uri);
    }

    /**
     * Mint one deed per plot. Only owner (backend worker) can mint.
     * Metadata reachable at baseURI + plotId + ".json" or explicit tokenUri.
     */
    function mintDeed(address to, string memory plotId, string memory tokenUri) external onlyOwner returns (uint256) {
        require(maxSupply == 0 || totalMinted < maxSupply, "max supply reached");
        require(plotToToken[plotId] == 0 || !exists(plotToToken[plotId]), "plot already minted");

        totalMinted++;
        uint256 tokenId = totalMinted;
        plotToToken[plotId] = tokenId;
        tokenPlot[tokenId] = plotId;
        _safeMint(to, tokenId);
        if (bytes(tokenUri).length > 7) {
            _setTokenURI(tokenId, tokenUri);
        }
        emit DeedMinted(tokenId, plotId, to);
        return tokenId;
    }

    function burnDeed(uint256 tokenId) external onlyOwner {
        require(exists(tokenId), "not exists");
        string memory plotId = tokenPlot[tokenId];
        _burn(tokenId);
        delete tokenPlot[tokenId];
        delete plotToToken[plotId];
    }

    // Overrides required by ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}