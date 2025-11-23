// create.js

console.log("create.js loaded");

// ----------------- basic wallet connect -----------------

let connectedAddress = null;

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found. Please install it first.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  connectedAddress = accounts[0];
  document.getElementById("connect-wallet-btn").textContent =
    connectedAddress.slice(0, 6) + "…" + connectedAddress.slice(-4);

  console.log("Connected:", connectedAddress);
}

document.getElementById("connect-wallet-btn").addEventListener("click", connectWallet);

// ----------------- in-memory asset state -----------------

/**
 * Asset shape:
 * {
 *   id: string,
 *   side: 'have' | 'want',
 *   type: 'erc721' | 'erc1155' | 'erc20',
 *   contract: string,
 *   tokenId?: string,
 *   amount?: string,
 *   name: string,
 *   imageUrl?: string,
 *   approved: boolean
 * }
 */

let haveAssets = [];
let wantAssets = [];
let nextAssetId = 1;

const haveListEl = document.getElementById("have-list");
const wantListEl = document.getElementById("want-list");
const createSwapBtn = document.getElementById("create-swap-btn");

// ----------------- render helpers -----------------

function renderAll() {
  renderSide("have", haveAssets, haveListEl);
  renderSide("want", wantAssets, wantListEl);
  updateCreateButtonState();
}

function renderSide(side, assets, containerEl) {
  containerEl.innerHTML = "";

  if (assets.length === 0) {
    const empty = document.createElement("div");
    empty.style.fontSize = "12px";
    empty.style.color = "#6b7280";
    empty.textContent = side === "have"
      ? "No assets yet. Add the NFTs or tokens you will send."
      : "No assets yet. Add the NFTs or tokens you want to receive.";
    containerEl.appendChild(empty);
    return;
  }

  for (const asset of assets) {
    const card = document.createElement("div");
    card.className = "asset-card";

    // thumbnail
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

    // right side
    const right = document.createElement("div");

    const title = document.createElement("div");
    title.className = "asset-main-title";
    title.textContent = asset.name || (asset.type.toUpperCase() + " asset");
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

    // approve button
    const approveBtn = document.createElement("button");
    approveBtn.className = "btn-small btn-small-approve" + (asset.approved ? " approved" : "");
    updateApproveBtnLabel(approveBtn, asset.approved);
    approveBtn.addEventListener("click", async () => {
      await handleApproveClick(asset, approveBtn);
    });
    btnRow.appendChild(approveBtn);

    // remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-small btn-small-remove";
    removeBtn.textContent = "✕ Remove";
    removeBtn.addEventListener("click", () => {
      if (asset.side === "have") {
        haveAssets = haveAssets.filter(a => a.id !== asset.id);
      } else {
        wantAssets = wantAssets.filter(a => a.id !== asset.id);
      }
      renderAll();
    });
    btnRow.appendChild(removeBtn);

    right.appendChild(btnRow);
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

// Maker-side: “create swap” button enabled only when maker’s assets are approved
function updateCreateButtonState() {
  const allHaveApproved =
    haveAssets.length > 0 && haveAssets.every(a => a.approved);

  if (allHaveApproved) {
    createSwapBtn.disabled = false;
    createSwapBtn.classList.add("ready");
  } else {
    createSwapBtn.disabled = true;
    createSwapBtn.classList.remove("ready");
  }

  // NOTE: on your **trade** page you can reuse this pattern, but
  // check wantAssets instead and gate the “Accept” button there.
  // const allWantApproved = wantAssets.length > 0 && wantAssets.every(a => a.approved);
}

// ----------------- approval handler (stub) -----------------

async function handleApproveClick(asset, btnEl) {
  if (!connectedAddress) {
    alert("Please connect your wallet first.");
    return;
  }

  // In a production build you’d:
  //   - if ERC721/1155: call setApprovalForAll for the collection
  //   - if ERC20: call approve(spender, amount)
  //   - wait for tx, then mark as approved
  //
  // For now we just flip the flag so you can test the UX.

  try {
    btnEl.disabled = true;
    btnEl.textContent = "…";

    // TODO: wire this up to your on-chain approval logic
    await new Promise(resolve => setTimeout(resolve, 500));

    asset.approved = !asset.approved;
    updateApproveBtnLabel(btnEl, asset.approved);
    updateCreateButtonState();
  } catch (err) {
    console.error("approve failed", err);
    alert("Error while approving asset: " + (err?.message || err));
  } finally {
    btnEl.disabled = false;
  }
}

// ----------------- modal logic -----------------

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

document.querySelectorAll(".add-assets-btn").forEach(btn => {
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
  tabButtons.forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("active", isActive);
  });

  ["nfts", "tokens", "custom"].forEach(name => {
    const panel = document.getElementById("tab-" + name);
    panel.classList.toggle("active", name === tabName);
  });
}

tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    switchTab(btn.dataset.tab);
  });
});

// ----------------- NFTs tab -----------------

const nftGridEl = document.getElementById("nft-picker-grid");
const nftLoadingText = document.getElementById("nft-loading-text");
const addSelectedNftsBtn = document.getElementById("add-selected-nfts-btn");

function updateAddSelectedNftsBtn() {
  const count = currentSelectedNftIds.size;
  addSelectedNftsBtn.textContent = `Add ${count} NFT${count === 1 ? "" : "s"}`;
  addSelectedNftsBtn.disabled = count === 0;
}

// TODO: replace this with your real NFT API
async function loadNftsForCurrentWallet() {
  nftGridEl.innerHTML = "";
  nftLoadingText.textContent = "";

  if (!connectedAddress) {
    nftLoadingText.textContent = "(connect wallet to see your NFTs)";
    return;
  }

  nftLoadingText.textContent = "";

  try {
    // Example: plug in Reservoir/Alchemy/etc here.
    // For now we just create 2 fake NFTs so the flow is visible.

    await new Promise(resolve => setTimeout(resolve, 400));

    lastLoadedNfts = [
      {
        id: "demo-1",
        contract: "0xDemoContract1",
        tokenId: "1324",
        name: "Demo NFT #1324",
        imageUrl: "https://via.placeholder.com/300x300.png?text=NFT+1324"
      },
      {
        id: "demo-2",
        contract: "0xDemoContract2",
        tokenId: "1325",
        name: "Demo NFT #1325",
        imageUrl: "https://via.placeholder.com/300x300.png?text=NFT+1325"
      }
    ];

    renderNftPicker(lastLoadedNfts);
  } catch (err) {
    console.error("Error loading NFTs", err);
    nftLoadingText.textContent = "(error loading NFTs; see console)";
  }
}

function renderNftPicker(nfts) {
  nftGridEl.innerHTML = "";
  currentSelectedNftIds.clear();
  updateAddSelectedNftsBtn();

  if (!nfts || nfts.length === 0) {
    const msg = document.createElement("div");
    msg.style.fontSize = "12px";
    msg.style.color = "#4b5563";
    msg.textContent = "No NFTs found via the demo loader. Use the Custom Asset tab to add them manually, or plug in your NFT API.";
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
    nameEl.textContent = nft.name || ("Token #" + nft.tokenId);
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

addSelectedNftsBtn.addEventListener("click", () => {
  const selected = lastLoadedNfts.filter(nft => currentSelectedNftIds.has(nft.id));
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

  renderAll();
  closeAssetModal();
});

// ----------------- TOKENS tab -----------------

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
    amount,
    name: "Ether (Wrapped)",
    imageUrl: "eth.png",
    approved: false
  });

  input.value = "";
  renderAll();
  closeAssetModal();
});

// ----------------- CUSTOM tab -----------------

document.getElementById("customSubmitBtn").addEventListener("click", () => {
  const type = document.getElementById("customTypeSelect").value;
  const addr = document.getElementById("customAddressInput").value.trim();
  const idOrAmt = document.getElementById("customIdInput").value.trim();

  if (!addr) {
    alert("Enter an asset address.");
    return;
  }

  const list = currentSideForModal === "have" ? haveAssets : wantAssets;

  const asset = {
    id: "asset-" + nextAssetId++,
    side: currentSideForModal,
    type,
    contract: addr,
    tokenId: undefined,
    amount: undefined,
    name: type.toUpperCase() + " asset",
    imageUrl: undefined,
    approved: false
  };

  if (type === "erc721" || type === "erc1155") {
    asset.tokenId = idOrAmt || "0";
  } else if (type === "erc20") {
    asset.amount = idOrAmt || "0";
  }

  list.push(asset);

  document.getElementById("customAddressInput").value = "";
  document.getElementById("customIdInput").value = "";

  renderAll();
  closeAssetModal();
});

// ----------------- create swap button (placeholder) -----------------

createSwapBtn.addEventListener("click", () => {
  if (createSwapBtn.disabled) return;

  // Here you’ll build the 0x order using haveAssets + wantAssets,
  // sign it, and save it using your Netlify function exactly like
  // you’re already doing in transfer.js.
  console.log("Create swap clicked", { haveAssets, wantAssets });

  alert("In the real app this would now build + sign a 0x order.\nCheck console for asset payload.");
});

// initial render
renderAll();
