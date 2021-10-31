import { deployments, ethers, network } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { VCDAO } from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signers";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("VC Dao", () => {
  let userA: SignerWithAddress, userB: SignerWithAddress;
  let dao: VCDAO;
  before(async () => {
    [userA, userB] = await ethers.getSigners();
  });
  describe("Create proposal", () => {
    beforeEach(async () => {
      await deployments.fixture();
      dao = await ethers.getContract("VCDAO");
    });
    it("should create a proposal", async () => {
      expect(await dao.getProposalCount()).to.eq(0);
      await dao.createProposal(userA.address, ethers.utils.parseEther("0.5"), {
        value: await dao.FEE(),
      });
      expect(await dao.getProposalCount()).to.eq(1);
      const proposal = await dao.proposals(0);
      expect(proposal.recipient).to.eq(userA.address);
      expect(proposal.amountRequested).to.eq(ethers.utils.parseEther("0.5"));
      expect(proposal.state).to.eq(0);
    });
    it("should require a fee", async () => {
      await expect(
        dao.createProposal(userA.address, ethers.utils.parseEther("0.5"))
      ).to.be.rejectedWith("missing fee");
    });
    it("should emit an event", async () => {
      expect(await dao.getProposalCount()).to.eq(0);
      const tx = await (
        await dao.createProposal(
          userA.address,
          ethers.utils.parseEther("0.5"),
          {
            value: await dao.FEE(),
          }
        )
      ).wait();

      const event = tx.events?.find((el) => el.event === "NewProposal")?.args;
      expect(event?.proposalId).to.eq(0);
      expect(event?.recipient).to.eq(userA.address);
      expect(event?.amountRequested).to.eq(ethers.utils.parseEther("0.5"));
    });
  });
  describe("Process proposal", () => {
    beforeEach(async () => {
      await deployments.fixture();
      dao = await ethers.getContract("VCDAO");
      await dao
        .connect(userB)
        .createProposal(userA.address, ethers.utils.parseEther("0.5"), {
          value: await dao.FEE(),
        });

      await dao.castVote(0, 1);
    });
    it("should process an existing proposal", async () => {
      expect((await dao.proposals(0)).state).to.eq(0);
      await network.provider.request({
        method: "evm_increaseTime",
        params: [691200],
      });
      await dao.processProposal(0);
      expect((await dao.proposals(0)).state).to.eq(1);
    });
    it("should revert for a proposal in voting period", async () => {
      expect((await dao.proposals(0)).state).to.eq(0);

      await expect(dao.processProposal(0)).to.be.rejectedWith(
        "proposal still live"
      );
    });
    it("should emit an event", async () => {
      await network.provider.request({
        method: "evm_increaseTime",
        params: [691200],
      });
      const event = await (
        await (await dao.processProposal(0)).wait()
      ).events?.find((el) => el.event === "ProcessProposal")?.args;
      expect(event?.proposalId).to.eq(0);
      expect(event?.outcome).to.eq(1);
      expect(event?.count).to.eq(1);
    });
  });
  describe("Cast vote", () => {
    beforeEach(async () => {
      await deployments.fixture();
      dao = await ethers.getContract("VCDAO");
      await dao
        .connect(userB)
        .createProposal(userA.address, ethers.utils.parseEther("0.5"), {
          value: await dao.FEE(),
        });
    });
    it("should increase the vote count", async () => {
      expect((await dao.proposals(0)).yesVotes).to.eq(0);
      await dao.castVote(0, 1);
      expect((await dao.proposals(0)).yesVotes).to.eq(1);
    });
    it("should not allow a user to vote twice", async () => {
      await dao.castVote(0, 1);
      await expect(dao.castVote(0, 2)).to.be.rejectedWith("already voted");
      expect((await dao.proposals(0)).yesVotes).to.eq(1);
      expect((await dao.proposals(0)).noVotes).to.eq(0);
    });
    it("should emit an event", async () => {
      const event = await (
        await (await dao.castVote(0, 1)).wait()
      ).events?.find((el) => el.event === "CastVote")?.args;
      expect(event?.proposalId).to.eq(0);
      expect(event?.vote).to.eq(1);
      expect(event?.voter).to.eq(userA.address);
    });
  });
  describe("Withdraw funds", () => {
    beforeEach(async () => {
      await deployments.fixture();
      dao = await ethers.getContract("VCDAO");
      await dao
        .connect(userB)
        .createProposal(userB.address, ethers.utils.parseEther("0.5"), {
          value: await dao.FEE(),
        });

      await dao.castVote(0, 1);
      await network.provider.request({
        method: "evm_increaseTime",
        params: [691200],
      });
      await dao.processProposal(0);
    });
    it("should transfer the user's funds", async () => {
      const userBalance = await userB.getBalance();
      await dao.connect(userB).withdrawFunds(0);
      expect((await userB.getBalance()).gt(userBalance)).to.eq(true);
    });
    it("should not allow a user to withdraw twice", async () => {
      await dao.connect(userB).withdrawFunds(0);
      await expect(dao.connect(userB).withdrawFunds(0)).to.be.rejectedWith(
        "invalid proposal"
      );
    });
    it("should emit an event", async () => {
      const event = await (
        await (await dao.connect(userB).withdrawFunds(0)).wait()
      ).events?.find((el) => el.event === "WithdrawFunds")?.args;

      expect(event?.recipient).to.eq(userB.address);
      expect(event?.amount).to.eq((await dao.proposals(0)).amountRequested);
    });
  });
});
