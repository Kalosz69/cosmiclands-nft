// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title CosmicLandsDeedV2
 * @notice ERC-721 deed dla Cosmic Lands (Base L2) z obsługą REZERWATU:
 *         działki rezerwatu mintowane terminowo (mintReserveDeed) z blokadą
 *         transferu do daty odblokowania planety (unlockAt). Blokady nie da się
 *         skrócić — setUnlockAt może tylko wydłużyć czas (bezpieczeństwo banku).
 * @dev V2 = V1 + lock. V1 pozostaje nietknięty; na produkcję wdrażany jest V2.
 */
contract CosmicLandsDeedV2 is ERC721, ERC721URIStorage, Ownable {
    using Strings for uint256;

    uint256 public totalMinted;
    uint256 public maxSupply;
    string public baseURI;

    // plotId (np. MARS-PLOT-000001) -> tokenId
    mapping(string => uint256) public plotToToken;
    mapping(uint256 => string) public tokenPlot;

    // tokenId -> timestamp, od którego deed jest transferowalny (0 = brak blokady)
    mapping(uint256 => uint256) public unlockAt;

    event DeedMinted(uint256 indexed tokenId, string plotId, address indexed to);
    event ReserveDeedMinted(uint256 indexed tokenId, string plotId, address indexed to, uint256 unlockTimestamp);
    event UnlockExtended(uint256 indexed tokenId, uint256 newUnlockTimestamp);
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

    /** Timestamp odblokowania deed (0 = od razu transferowalny). */
    function lockedUntil(uint256 tokenId) public view returns (uint256) {
        return unlockAt[tokenId];
    }

    function _baseURI() internal view override returns (string memory) {
        return baseURI;
    }

    function setBaseURI(string memory _uri) external onlyOwner {
        baseURI = _uri;
        emit BaseURIUpdated(_uri);
    }

    /** Mint komercyjny — od razu transferowalny (zachowanie V1). */
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

    /**
     * Mint rezerwatu — działka mintowana TERMINOWO (zgodnie z harmonogramem),
     * ale transfer zablokowany do unlockTimestamp (odblokowanie planety:
     * 10/15/20/25/30/35/40/50 lat). Tylko owner (backend worker / vault).
     */
    function mintReserveDeed(address to, string memory plotId, string memory tokenUri, uint256 unlockTimestamp)
        external onlyOwner returns (uint256)
    {
        require(unlockTimestamp > block.timestamp, "unlock must be in future");
        require(maxSupply == 0 || totalMinted < maxSupply, "max supply reached");
        require(plotToToken[plotId] == 0 || !exists(plotToToken[plotId]), "plot already minted");

        totalMinted++;
        uint256 tokenId = totalMinted;
        plotToToken[plotId] = tokenId;
        tokenPlot[tokenId] = plotId;
        unlockAt[tokenId] = unlockTimestamp;
        _safeMint(to, tokenId);
        if (bytes(tokenUri).length > 7) {
            _setTokenURI(tokenId, tokenUri);
        }
        emit ReserveDeedMinted(tokenId, plotId, to, unlockTimestamp);
        return tokenId;
    }

    /**
     * Batch mint rezerwatu — cała planeta (2000 działek) w JEDNEJ transakcji.
     * Wymagane dla "wszystkie minty naraz + depozyt w banku" (K 19.08):
     * 16 000 pojedynczych tx = niepotrzebny koszt; batch = 1 tx na planetę.
     * Unlock timestamp wspólny dla całej planety (jedno okno odblokowania).
     * Wszystkie działki mintowane na adres banku (vault) — owner tylko pośredniczy.
     */
    function mintReserveBatch(
        address to,
        string[] calldata plotIds,
        string[] calldata tokenUris,
        uint256 unlockTimestamp
    ) external onlyOwner returns (uint256[] memory tokenIds) {
        require(plotIds.length == tokenUris.length, "length mismatch");
        require(unlockTimestamp > block.timestamp, "unlock must be in future");
        tokenIds = new uint256[](plotIds.length);
        for (uint256 i = 0; i < plotIds.length; i++) {
            require(maxSupply == 0 || totalMinted < maxSupply, "max supply reached");
            require(plotToToken[plotIds[i]] == 0 || !exists(plotToToken[plotIds[i]]), "plot already minted");
            totalMinted++;
            uint256 tokenId = totalMinted;
            plotToToken[plotIds[i]] = tokenId;
            tokenPlot[tokenId] = plotIds[i];
            unlockAt[tokenId] = unlockTimestamp;
            _safeMint(to, tokenId);
            if (bytes(tokenUris[i]).length > 7) {
                _setTokenURI(tokenId, tokenUris[i]);
            }
            emit ReserveDeedMinted(tokenId, plotIds[i], to, unlockTimestamp);
            tokenIds[i] = tokenId;
        }
    }

    /**
     * Wydłużenie blokady (np. governance decyduje o przesunięciu odblokowania).
     * TYLKO wydłużenie — skrócenie niemożliwe: banku nie da się ruszyć wcześniej.
     */
    function setUnlockAt(uint256 tokenId, uint256 newUnlockTimestamp) external onlyOwner {
        require(exists(tokenId), "not exists");
        require(newUnlockTimestamp > unlockAt[tokenId], "only extend lock");
        unlockAt[tokenId] = newUnlockTimestamp;
        emit UnlockExtended(tokenId, newUnlockTimestamp);
    }

    function burnDeed(uint256 tokenId) external onlyOwner {
        require(exists(tokenId), "not exists");
        string memory plotId = tokenPlot[tokenId];
        _burn(tokenId);
        delete tokenPlot[tokenId];
        delete plotToToken[plotId];
        delete unlockAt[tokenId];
    }

    /**
     * Blokada transferu: deed rezerwatu nie może zmienić właściciela
     * przed unlockAt. Mint (from=0) i burn (to=0) zawsze dozwolone.
     */
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            require(block.timestamp >= unlockAt[tokenId], "deed locked until unlock timestamp");
        }
        return super._update(to, tokenId, auth);
    }

    // Overrides wymagane przez ERC721URIStorage
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
