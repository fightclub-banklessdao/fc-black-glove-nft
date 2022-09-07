import {expect} from "chai"
import {ethers} from "hardhat"
import {Contract} from "ethers"
import {MerkleTree} from "merkletreejs"
import keccak256 from "keccak256"

describe("BlackGlove Public Mint Tests", function() {

  //Global variables //
  //values will be set inside "before" during setup//
  let blackglove: Contract
  let merkletree: any  
  let owner:  any
  let dev: any
  let fcWallet: any
  let whitelisted: any 
  let nonWhitelisted: any
  const provider = ethers.provider;
  //function ro process addresses for leaf nodes //
  const padBuffer = (addr: any) => {
    return Buffer.from(addr.substr(2).padStart(32*2, 0), 'hex')
  }
  //--------------------------------------------------------------------------------------------------//
  // Setup/Deployment//
  before(async function(){
    // get accounts (10) for test suit
    let accounts:any = await ethers.getSigners()
    //-------------------------------------//
    // ---------FC-BlackGlove-Deployment-Prep-----------------//
    // -----------------------------------//
    // dev wallet address for commisions testing//
    dev = accounts.slice(0,2).map(function(account:any){
      return account.address
    })
   // console.log('dev', dev)
   //fc - benficiary wallet//
   fcWallet = accounts[3].address
   // take first five addresses for whitelist//
   whitelisted = accounts.slice(0, 5)
   // the next five addresses for non-whitelisted accounts
   nonWhitelisted = accounts.slice(6, 10)
   // hash whitelist addresses for creating leaf nodes 
   console.log("Creating MerkleTree for whitelist")
   const leaves = whitelisted.map(function(account:any){
      return padBuffer(account.address)
   })
    //create MerkleTree for whitelisted addresses 
    merkletree = new MerkleTree(leaves, keccak256, {sortPairs: true})
    const rootHash = await merkletree.getHexRoot()
    // discount duration - for testing, we are using 60 seconds//
    const discountDuration = 200 
    //-----------------------------------------//
    //---------BlackGlove----------------------//
    //-----------------------------------------//
    //deploy the contract with root hash for whitelisted MerkleTree
    console.log("Deploying BlackGlove with root hash :", rootHash)
    const BlackGlove = await ethers.getContractFactory("BlackGloveMock")
    //setting price and discountedPrice.
    const discountedPrice = ethers.utils.parseUnits("600", 18)
    const price = ethers.utils.parseUnits("650", 18)
    blackglove = await BlackGlove.deploy(rootHash, dev, discountedPrice, price, fcWallet, discountDuration)
  })
  it("Total supply of 1000", async () => {
    //set the _tokenIds to max supply - the variable used for comparison//
    //console.log('initial id', await blackglove.totalSupply())
    // now id is set to MAX_SUPPLY = 100 //
    await blackglove.setTokenIdToMaxSupply()
    //console.log('current id after mock update', await blackglove.totalSupply())
    const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[0].address))
    await expect(blackglove.connect(whitelisted[1]).mint(merkleproof)).to.be.revertedWith("Max supply reached!")
    //reset the counter after to rest of the tests can be performed//
    await blackglove.resetTokenId()
    expect(await blackglove.totalSupply()).to.equal(0) 
  })
  it("Non whitelisted gets the cost 650", async () => {
    const merkleproof = await merkletree.getHexProof(padBuffer(nonWhitelisted[2].address))
    const cost = await blackglove.connect(whitelisted[0]).getCost(merkleproof)
    // format the returned value to compare it with the number
    const formattedCost = Number(ethers.utils.formatEther(cost))
    await expect(formattedCost).to.equal(650)
  })
  it("Witelisted gets the cost 600", async () => {
    const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[0].address))
    const cost = await blackglove.connect(whitelisted[0]).getCost(merkleproof)
    // format the returned value to compare it with the number
    const formattedCost = Number(ethers.utils.formatEther(cost)) 
    expect(formattedCost).to.equal(600)
  })
  // ToDo - need to work on this one //
  it("A whitelisted address can mint the BlackGlove with a discount within the discount period", async () => { 
    const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[0].address))
    await expect (blackglove.connect(whitelisted[1]).mint(merkleproof, 
      {value: ethers.utils.parseEther("651"), gasLimit: 10000000} 
    )).to.emit(blackglove, "Minted")
  })
  // ALERT! time-sensitive test//
  it("A whitelisted address can not mint at the discount after discount period is over", async () => {
    // we will wait for 120000 ms as for test we have set 120 seconds of discountDuration//
    // after waiting for that period, we are going to call mint function with whitelisted address //
    // the error should be ERC20: "insufficient allowance" as after discount duration the cost is 650 matic while we only allowded 600
      setTimeout(async function(){
        const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[1].address)) 
        await expect(blackglove.connect(whitelisted[1]).mint(merkleproof, {value: ethers.utils.parseEther("600")})).to.be.revertedWith("Insufficient funds!")
      , 200000})
  })
  it("A whitelisted address can mint at regular price after discount period is over", async () => {
      setTimeout(async function(){
      const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[1].address)) 
      await expect(blackglove.connect(whitelisted[1]).mint(merkleproof)).to.emit(blackglove, "Transfer")
      }, 200000)
  })
  //whitelist can mint at regular price after discouint duration//
  it("A non-whitelisted address can not mint the BlackGlove with a discount", async () => {
    const merkleproof = await merkletree.getHexProof(padBuffer(nonWhitelisted[1].address))
    await expect(blackglove.connect(nonWhitelisted[1]).mint(merkleproof, 
      {value: ethers.utils.parseEther("600"), gasLimit: 10000000})).to.be.revertedWith("Insufficient funds!");
  })
  it("A non-whitelisted address can mint the BlackGlove with a regular price", async() => {
    const merkleproof = await merkletree.getHexProof(padBuffer(nonWhitelisted[0].address))
    await expect(blackglove.connect(nonWhitelisted[0]).mint(merkleproof, {value: ethers.utils.parseEther("650")})).to.emit(blackglove, "Transfer");
  })
  it("A whitelisted address can not mint again", async() => {
    const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[1].address))
    await expect(blackglove.connect(whitelisted[1]).mint(merkleproof, 
      {value: ethers.utils.parseEther("600"), gasLimit: 10000000}
    )).to.be.revertedWith("A wallet can not mint more than 1 Black Glove")
  })
  it("A non-whitelisted address can not mint again", async() => {
    const merkleproof = await merkletree.getHexProof(padBuffer(nonWhitelisted[0].address))
    await expect(blackglove.connect(nonWhitelisted[0]).mint(merkleproof)).to.be.revertedWith("A wallet can not mint more than 1 Black Glove")
  })
  it("Minted NFT have the correct URI", async () => {
    expect(await blackglove.tokenURI(1)).to.be.equal(await blackglove.TOKEN_URI())
  })
  it("A non-whitelisted address can not mint at discount rate with merkleproof of whitelisted address", async() => {
    const merkleproof = await merkletree.getHexProof(padBuffer(whitelisted[0].address))
    await expect(blackglove.connect(nonWhitelisted[1]).mint(merkleproof, 
      {value: ethers.utils.parseEther("601"), gasLimit: 10000000}
    )).to.be.revertedWith("Insufficient funds!")
  })
  it("Owner can pause the contract, mint can not be performed in paused state", async() => {
    await blackglove.connect(whitelisted[0]).pause()
    const merkleproof = await merkletree.getHexProof(padBuffer(nonWhitelisted[2].address))
    await expect(blackglove.connect(nonWhitelisted[2]).mint(merkleproof)).to.be.revertedWith("Black Glove is paused")
  })
  it("Owner can withdraw the funds", async() => {
     const contractBalance = ethers.utils.formatEther(
        (await provider.getBalance(blackglove.address)).toString()
      );

      const ownerBalance = ethers.utils.formatEther(
        (await provider.getBalance(whitelisted[0].address)).toString()
      );

      let tx: any

      await expect(tx = await blackglove.connect(whitelisted[0]).withdraw()).to.emit(blackglove, "Withdraw")
      const receipt = await tx.wait();
      const gasSpent = ethers.utils.formatEther(
        receipt.cumulativeGasUsed.mul(receipt.effectiveGasPrice)
      );

      expect(
        //curent user balance in correct format//
        Number(ethers.utils.formatEther(await provider.getBalance(whitelisted[0].address))).toFixed(10)
      ).to.equal(Number(
        // add contract balance + ownerBalance - gasspent
        Number(contractBalance) + Number(ownerBalance) - Number(gasSpent)).toFixed(10))
  })
  it("General user can not withdraw the funds", async () => {
    await expect(blackglove.connect(nonWhitelisted[3]).withdraw()).to.be.revertedWith("Ownable: caller is not the owner")
  })
  it("General user can not update beneficiary address", async () => {
    await expect(blackglove.connect(nonWhitelisted[0]).updateBeneficiaryAddress(nonWhitelisted[1].address)).to.be.revertedWith("Ownable: caller is not the owner")
  })  
  it("Owner can update the beneficiary address", async () => {
    const newAddress = whitelisted[1].address
    await expect(blackglove.connect(whitelisted[0]).updateBeneficiaryAddress(newAddress)).to.emit(blackglove, "BeneficiaryUpdated")
    expect(await blackglove.beneficiary()).to.equal(newAddress)
  })
})

