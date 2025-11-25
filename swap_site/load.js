// load.js
console.log("load.js loaded");

let order = null;
let signature = null;

// 1. Read and parse the swap data from the URL hash
function loadSwapFromHash() {
  const h = window.location.hash;
  if (!h || h.length < 2) {
    alert("No swap data in URL.");
    document.getElementById("swap-json").textContent =
      "No swap data in URL.";
    document.getElementById("fill-btn").disabled = true;
    return;
  }

  try {
    const decoded = decodeURIComponent(h.slice(1)); // remove '#'
    const payload = JSON.parse(decoded);

    order = payload.order;
    signature = payload.signature;

    if (!order || !signature) {
      throw new Error("Missing order or signature in payload.");
    }

    document.getElementById("swap-json").textContent =
      JSON.stringify(payload, null, 2);
  } catch (err) {
    console.error("Error loading swap", err);
    alert("Malformed swap link.");
    document.getElementById("swap-json").textContent =
      "Malformed swap link.";
    document.getElementById("fill-btn").disabled = true;
  }
}

// 2. Call 0x v2 Exchange fillOrder on-chain
async function fillOrderOnChain(order, signature) {
  if (!window.ethereum) {
    throw new Error("No wallet available. Install MetaMask.");
  }

  const provider = new ethers.providers.Web3Provider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const signer = provider.getSigner();
  const taker = await signer.getAddress();

  console.log("Filling swap as taker:", taker);

  // 0x v2 Exchange ABI (only fillOrder)
  const exchangeAbi = [
    "function fillOrder(tuple(" +
      "address makerAddress," +
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
    ") order, uint256 takerAssetFillAmount, bytes signature)" +
    " external returns (uint256, uint256)"
  ];

  const EXCHANGE = "0x080bf510FCbF18b91105470639e9561022937712";
  const exchange = new ethers.Contract(EXCHANGE, exchangeAbi, signer);

  const fillAmount = order.takerAssetAmount; // for your flow this is "1"

  console.log("Calling fillOrder with amount:", fillAmount);

  const tx = await exchange.fillOrder(order, fillAmount, signature, {
    gasLimit: 300000
  });

  console.log("fillOrder tx sent:", tx.hash);
  alert("fillOrder transaction submitted:\n" + tx.hash);

  const receipt = await tx.wait();
  console.log("fillOrder confirmed:", receipt.transactionHash);
  alert("Swap filled! Transaction confirmed:\n" + receipt.transactionHash);
}

// 3. Wire up the button
document.addEventListener("DOMContentLoaded", () => {
  loadSwapFromHash();

  const fillBtn = document.getElementById("fill-btn");
  fillBtn.addEventListener("click", async () => {
    if (!order || !signature) {
      alert("Swap data not loaded.");
      return;
    }

    fillBtn.disabled = true;
    fillBtn.textContent = "Filling…";

    try {
      await fillOrderOnChain(order, signature);
    } catch (err) {
      console.error("Fill failed", err);
      alert("Error filling swap: " + (err?.message || err));
    } finally {
      fillBtn.disabled = false;
      fillBtn.textContent = "Fill This Swap";
    }
  });
});
