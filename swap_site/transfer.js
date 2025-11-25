console.log("transfer.js loaded, ethers =", typeof ethers);

// --------------------- Constants ---------------------

// 0x operator address you approve via setApprovalForAll
const OPERATOR_ADDRESS = "0xeFc70A1B18C432bdc64b596838B4D138f6bC6cad";

// 0x v2 Exchange (mainnet)
const ZEROX_EXCHANGE_ADDRESS = "0x080bf510FCbF18b91105470639e9561022937712";
const ZERO_ADDRESS           = "0x0000000000000000000000000000000000000000";

// ERC721 Proxy ID for 0x v2 assetData
const ERC721_PROXY_ID = "0x02571792";

// Minimal ABIs
const ERC721_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

const ZEROX_EXCHANGE_ABI = [
  "function fillOrder(" +
    "(address makerAddress," +
      "address takerAddress," +
      "address feeRecipientAddress," +
      "address senderAddress," +
      "uint256 makerAssetAmount," +
      "uint256 takerAssetAmount," +
      "uint256 makerFee," +
      "uint256 takerFee," +
      "uint256 expirationTimeSeconds," +
      "uint256 salt," +
      "bytes makerAssetData," +
      "bytes takerAssetData" +
    ") order," +
    "uint256 takerAssetFillAmount," +
    "bytes signature" +
  ") external returns (uint256 fillMakerAssetAmount, uint256 fillTakerAssetAmount)"
];

// 0x EIP-712 domain + types (v2, no chainId)
const EIP712_DOMAIN = {
  name: "0x Protocol",
  version: "2",
  verifyingContract: ZEROX_EXCHANGE_ADDRESS,
};

const EIP712_TYPES = {
  Order: [
    { name: "makerAddress",        type: "address" },
    { name: "takerAddress",        type: "address" },
    { name: "feeRecipientAddress", type: "address" },
    { name: "senderAddress",       type: "address" },
    { name: "makerAssetAmount",    type: "uint256" },
    { name: "takerAssetAmount",    type: "uint256" },
    { name: "makerFee",            type: "uint256" },
    { name: "takerFee",            type: "uint256" },
    { name: "expirationTimeSeconds", type: "uint256" },
    { name: "salt",                type: "uint256" },
    { name: "makerAssetData",      type: "bytes" },
    { name: "takerAssetData",      type: "bytes" },
  ],
};

// --------------------- Helpers ---------------------

function encodeErc721AssetData(tokenAddress, tokenId) {
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256"],
    [tokenAddress, tokenId]
  );
  return ERC721_PROXY_ID + encodedParams.slice(2);
}

function getMakerNftFromUI() {
  const contractInput = document.getElementById("makerNftContractInput");
  const tokenIdInput  = document.getElementById("makerTokenIdInput");

  const contract = contractInput.value.trim();
  const tokenIdStr = tokenIdInput.value.trim();

  if (!ethers.utils.isAddress(contract)) {
    throw new Error("Invalid maker NFT contract address.");
  }
  if (!tokenIdStr) {
    throw new Error("Invalid maker NFT token ID.");
  }

  return {
    contract,
    tokenId: ethers.BigNumber.from(tokenIdStr).toString(),
  };
}

function getTakerNftFromUI() {
  const contractInput = document.getElementById("takerNftContractInput");
  const tokenIdInput  = document.getElementById("takerTokenIdInput");

  const contract = contractInput.value.trim();
  const tokenIdStr = tokenIdInput.value.trim();

  if (!ethers.utils.isAddress(contract)) {
    throw new Error("Invalid taker NFT contract address.");
  }
  if (!tokenIdStr) {
    throw new Error("Invalid taker NFT token ID.");
  }

  return {
    contract,
    tokenId: ethers.BigNumber.from(tokenIdStr).toString(),
  };
}

// --------------------- Step 1 – Maker approval ---------------------

async function approveOperatorForCollection() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask first.");
      return;
    }

    const makerNft = getMakerNftFromUI();

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();
    const owner    = await signer.getAddress();

    const nftContract = new ethers.Contract(makerNft.contract, ERC721_ABI, signer);

    const alreadyApproved = await nftContract.isApprovedForAll(owner, OPERATOR_ADDRESS);
    if (alreadyApproved) {
      alert("Operator already approved for this collection.");
      return;
    }

    // --- estimate a "low but safe" EIP-1559 fee (this is the important bit) ---
    const latestBlock = await provider.getBlock("latest");

    if (!latestBlock.baseFeePerGas) {
      // fallback for non-EIP1559 networks
      const gasPrice = await provider.getGasPrice();
      // take something like 0.8x of the current gas price as "low"
      const suggestedGasPrice = gasPrice.mul(8).div(10);

      const tx = await nftContract.setApprovalForAll(OPERATOR_ADDRESS, true, {
        gasPrice: suggestedGasPrice,
        gasLimit: 60000,
      });

      console.log("Approval tx sent:", tx.hash);
      await tx.wait();
      alert("Approval confirmed!");
      return;
    }

    const baseFee = latestBlock.baseFeePerGas;                   // BigNumber (wei)

    // choose a small tip (priority fee), e.g. 1 gwei
    const tip = ethers.utils.parseUnits("0.05", "gwei");

    // “low” style: just above base fee
    const maxPriorityFeePerGas = tip;
    const maxFeePerGas = baseFee.mul(102).div(100).add(tip);       // ~ baseFee*1.1 + tip

    // you can tweak 11/10 to 12/10 etc to be slightly more or less aggressive

    const tx = await nftContract.setApprovalForAll(OPERATOR_ADDRESS, true, {
      gasLimit: 60000,              // setApprovalForAll is usually ~50–60k
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    console.log("Approval tx sent:", tx.hash);
    alert("Approval transaction sent! " + tx.hash);

    await tx.wait();
    alert("Approval confirmed!");
  } catch (err) {
  }
}


// --------------------- Step 2 – Maker signs order ---------------------

function buildOrder(makerAddress, takerAddress) {
  const now    = Math.floor(Date.now() / 1000);
  const expiry = now + 60 * 60 * 24; // 24 hours

  const makerNft = getMakerNftFromUI();
  const takerNft = getTakerNftFromUI();

  const makerAssetData = encodeErc721AssetData(makerNft.contract, makerNft.tokenId);
  const takerAssetData = encodeErc721AssetData(takerNft.contract, takerNft.tokenId);

  return {
    makerAddress,
    takerAddress: takerAddress && takerAddress !== "" ? takerAddress : ZERO_ADDRESS,
    feeRecipientAddress: ZERO_ADDRESS,
    senderAddress: ZERO_ADDRESS,
    makerAssetAmount: "1",
    takerAssetAmount: "1",
    makerFee: "0",
    takerFee: "0",
    expirationTimeSeconds: String(expiry),
    salt: String(Date.now()),
    makerAssetData,
    takerAssetData,
  };
}

async function signOrderAsMaker() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();
    const maker    = await signer.getAddress();

    const takerAddrInput = document.getElementById("takerAddressInput");
    const takerAddr = takerAddrInput ? takerAddrInput.value.trim() : "";

    let order;
    try {
      order = buildOrder(maker, takerAddr);
    } catch (e) {
      console.error("Failed to build order:", e);
      alert(e.message || "Error building order. Check NFT inputs.");
      return;
    }

    console.log("Order to sign:", order);

    const rawSig = await signer._signTypedData(EIP712_DOMAIN, EIP712_TYPES, order);
    const split  = ethers.utils.splitSignature(rawSig);

    const vHex = ethers.utils.hexlify(split.v).slice(2).padStart(2, "0");
    const signatureTypeHex = "02"; // EIP712 signature type for 0x

    const signature =
      "0x" +
      vHex +
      split.r.slice(2) +
      split.s.slice(2) +
      signatureTypeHex;

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

    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");
    if (orderJsonEl) orderJsonEl.value = JSON.stringify(order, null, 2);
    if (orderSigEl)  orderSigEl.value  = signature;

    // Save to backend
    try {
      const res = await fetch("/.netlify/functions/save-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, signature }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("save-order failed:", txt);
        alert("Order signed, but failed to save on server.");
        return;
      }

      const { id } = await res.json();
      const tradeUrl = `${window.location.origin}/?orderId=${encodeURIComponent(id)}`;
      console.log("Trade created with ID:", id, "URL:", tradeUrl);
      alert("Order signed & saved!\nShare this URL with the taker:\n\n" + tradeUrl);
    } catch (saveErr) {
      console.error("Error calling save-order:", saveErr);
      alert("Order signed, but error saving on backend.");
    }
  } catch (err) {
    console.error(err);
    alert("Error while signing order: " + (err?.message || err));
  }
}

// --------------------- Step 3 – Taker accepts ---------------------

async function acceptTradeAsTaker() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found.");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();
    const taker    = await signer.getAddress();

    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");

    if (!orderJsonEl || !orderJsonEl.value) {
      alert("No order JSON found.");
      return;
    }
    if (!orderSigEl || !orderSigEl.value) {
      alert("No signature found.");
      return;
    }

    const order     = JSON.parse(orderJsonEl.value);
    const signature = orderSigEl.value.trim();

    console.log("Loaded order:", order, "signature:", signature);

    const zeroAddr = ZERO_ADDRESS.toLowerCase();
    const allowedTaker =
      order.takerAddress.toLowerCase() === zeroAddr ||
      order.takerAddress.toLowerCase() === taker.toLowerCase();

    if (!allowedTaker) {
      alert("This order is not intended for your address.");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Number(order.expirationTimeSeconds) <= now) {
      alert("Order has expired.");
      return;
    }

    const exchange = new ethers.Contract(
      ZEROX_EXCHANGE_ADDRESS,
      ZEROX_EXCHANGE_ABI,
      signer
    );

    const takerFillAmount = order.takerAssetAmount.toString();

    console.log("Calling fillOrder with:", {
      order,
      takerFillAmount,
      signature,
    });

    const tx = await exchange.fillOrder(order, takerFillAmount, signature);
    console.log("fillOrder tx sent:", tx.hash);
    alert("Trade tx sent! " + tx.hash);

    const receipt = await tx.wait();
    console.log("Trade confirmed:", receipt);
    alert("NFT swap completed (if approvals & ownership were correct).");
  } catch (err) {
    console.error(err);
    alert("Error while accepting trade: " + (err?.message || err));
  }
}

// --------------------- Auto-load order ---------------------

async function autoLoadOrderFromUrl() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");
  if (!orderId) return;

  try {
    const res = await fetch(
      "/.netlify/functions/get-order?id=" + encodeURIComponent(orderId)
    );
    if (!res.ok) {
      console.warn("Failed to load order:", await res.text());
      return;
    }
    const { order, signature } = await res.json();
    console.log("Loaded order from backend:", order, signature);

    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");
    if (orderJsonEl) orderJsonEl.value = JSON.stringify(order, null, 2);
    if (orderSigEl)  orderSigEl.value  = signature;
  } catch (e) {
    console.error("Error loading order:", e);
  }
}

// --------------------- Wire up buttons ---------------------

document.addEventListener("DOMContentLoaded", () => {
  const approveBtn = document.getElementById("transferNftButton");
  if (approveBtn) approveBtn.addEventListener("click", approveOperatorForCollection);

  const signBtn = document.getElementById("signOrderButton");
  if (signBtn) signBtn.addEventListener("click", signOrderAsMaker);

  const acceptBtn = document.getElementById("acceptTradeButton");
  if (acceptBtn) acceptBtn.addEventListener("click", acceptTradeAsTaker);

  autoLoadOrderFromUrl();
});
