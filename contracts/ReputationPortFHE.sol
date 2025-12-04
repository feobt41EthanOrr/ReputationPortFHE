// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ReputationPortFHE is SepoliaConfig {
    struct EncryptedReputation {
        uint256 id;
        euint32 encryptedScore;
        euint32 encryptedDappId;
        euint32 encryptedUserId;
        uint256 timestamp;
    }
    
    struct DecryptedReputation {
        uint256 score;
        string dappId;
        string userId;
        bool isVerified;
    }

    uint256 public reputationCount;
    mapping(uint256 => EncryptedReputation) public encryptedReputations;
    mapping(uint256 => DecryptedReputation) public decryptedReputations;
    
    mapping(string => euint32) private encryptedDappStats;
    string[] private dappList;
    
    mapping(uint256 => uint256) private requestToReputationId;
    
    event ReputationSubmitted(uint256 indexed id, uint256 timestamp);
    event VerificationRequested(uint256 indexed id);
    event ReputationVerified(uint256 indexed id);
    
    modifier onlyUser(uint256 reputationId) {
        _;
    }
    
    function submitEncryptedReputation(
        euint32 encryptedScore,
        euint32 encryptedDappId,
        euint32 encryptedUserId
    ) public {
        reputationCount += 1;
        uint256 newId = reputationCount;
        
        encryptedReputations[newId] = EncryptedReputation({
            id: newId,
            encryptedScore: encryptedScore,
            encryptedDappId: encryptedDappId,
            encryptedUserId: encryptedUserId,
            timestamp: block.timestamp
        });
        
        decryptedReputations[newId] = DecryptedReputation({
            score: 0,
            dappId: "",
            userId: "",
            isVerified: false
        });
        
        emit ReputationSubmitted(newId, block.timestamp);
    }
    
    function requestReputationVerification(uint256 reputationId) public onlyUser(reputationId) {
        EncryptedReputation storage rep = encryptedReputations[reputationId];
        require(!decryptedReputations[reputationId].isVerified, "Already verified");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(rep.encryptedScore);
        ciphertexts[1] = FHE.toBytes32(rep.encryptedDappId);
        ciphertexts[2] = FHE.toBytes32(rep.encryptedUserId);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.verifyReputation.selector);
        requestToReputationId[reqId] = reputationId;
        
        emit VerificationRequested(reputationId);
    }
    
    function verifyReputation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 reputationId = requestToReputationId[requestId];
        require(reputationId != 0, "Invalid request");
        
        EncryptedReputation storage eRep = encryptedReputations[reputationId];
        DecryptedReputation storage dRep = decryptedReputations[reputationId];
        require(!dRep.isVerified, "Already verified");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint256 score, string memory dappId, string memory userId) = 
            abi.decode(cleartexts, (uint256, string, string));
        
        dRep.score = score;
        dRep.dappId = dappId;
        dRep.userId = userId;
        dRep.isVerified = true;
        
        if (FHE.isInitialized(encryptedDappStats[dRep.dappId]) == false) {
            encryptedDappStats[dRep.dappId] = FHE.asEuint32(0);
            dappList.push(dRep.dappId);
        }
        encryptedDappStats[dRep.dappId] = FHE.add(
            encryptedDappStats[dRep.dappId], 
            FHE.asEuint32(1)
        );
        
        emit ReputationVerified(reputationId);
    }
    
    function getDecryptedReputation(uint256 reputationId) public view returns (
        uint256 score,
        string memory dappId,
        string memory userId,
        bool isVerified
    ) {
        DecryptedReputation storage r = decryptedReputations[reputationId];
        return (r.score, r.dappId, r.userId, r.isVerified);
    }
    
    function getEncryptedDappStats(string memory dappId) public view returns (euint32) {
        return encryptedDappStats[dappId];
    }
    
    function requestDappStatsDecryption(string memory dappId) public {
        euint32 stats = encryptedDappStats[dappId];
        require(FHE.isInitialized(stats), "DApp not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(stats);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDappStats.selector);
        requestToReputationId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(dappId)));
    }
    
    function decryptDappStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 dappHash = requestToReputationId[requestId];
        string memory dappId = getDappFromHash(dappHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 stats = abi.decode(cleartexts, (uint32));
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getDappFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < dappList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(dappList[i]))) == hash) {
                return dappList[i];
            }
        }
        revert("DApp not found");
    }
    
    function calculatePortableReputation(
        string memory userId,
        string[] memory sourceDapps
    ) public view returns (uint256 portableScore) {
        uint256 totalScore = 0;
        uint256 count = 0;
        
        for (uint256 i = 1; i <= reputationCount; i++) {
            if (decryptedReputations[i].isVerified && 
                keccak256(abi.encodePacked(decryptedReputations[i].userId)) == keccak256(abi.encodePacked(userId))) {
                for (uint256 j = 0; j < sourceDapps.length; j++) {
                    if (keccak256(abi.encodePacked(decryptedReputations[i].dappId)) == keccak256(abi.encodePacked(sourceDapps[j]))) {
                        totalScore += decryptedReputations[i].score;
                        count++;
                        break;
                    }
                }
            }
        }
        return count > 0 ? totalScore / count : 0;
    }
    
    function generateReputationProof(
        string memory userId,
        string memory dappId,
        uint256 minScore
    ) public view returns (bool hasSufficientReputation) {
        for (uint256 i = 1; i <= reputationCount; i++) {
            if (decryptedReputations[i].isVerified && 
                keccak256(abi.encodePacked(decryptedReputations[i].userId)) == keccak256(abi.encodePacked(userId)) &&
                keccak256(abi.encodePacked(decryptedReputations[i].dappId)) == keccak256(abi.encodePacked(dappId)) &&
                decryptedReputations[i].score >= minScore) {
                return true;
            }
        }
        return false;
    }
}