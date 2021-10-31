import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { ethers } from "hardhat";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy dao
  await deploy("VCDAO", {
    from: deployer,
    log: true,
    autoMine: true,
    args: [[deployer]],
    value: ethers.utils.parseEther("5"),
  });
};
export default func;
