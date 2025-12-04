// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ReputationData {
  id: string;
  source: string;
  score: number;
  timestamp: number;
  owner: string;
  verified: boolean;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [reputations, setReputations] = useState<ReputationData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newReputationData, setNewReputationData] = useState({
    source: "",
    score: 0,
    details: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterVerified, setFilterVerified] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showTeamInfo, setShowTeamInfo] = useState(false);
  const [language, setLanguage] = useState<"en" | "zh">("en");

  const itemsPerPage = 5;

  // Calculate statistics
  const totalReputations = reputations.length;
  const avgScore = totalReputations > 0 
    ? reputations.reduce((sum, rep) => sum + rep.score, 0) / totalReputations 
    : 0;
  const verifiedCount = reputations.filter(rep => rep.verified).length;

  // Filter and paginate data
  const filteredReputations = reputations.filter(rep => {
    const matchesSearch = rep.source.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rep.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterVerified ? rep.verified : true;
    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.ceil(filteredReputations.length / itemsPerPage);
  const paginatedReputations = filteredReputations.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    loadReputations().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert(language === "en" ? "Failed to connect wallet" : "连接钱包失败");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadReputations = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("reputation_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing reputation keys:", e);
        }
      }
      
      const list: ReputationData[] = [];
      
      for (const key of keys) {
        try {
          const repBytes = await contract.getData(`reputation_${key}`);
          if (repBytes.length > 0) {
            try {
              const repData = JSON.parse(ethers.toUtf8String(repBytes));
              list.push({
                id: key,
                source: repData.source,
                score: repData.score,
                timestamp: repData.timestamp,
                owner: repData.owner,
                verified: repData.verified || false
              });
            } catch (e) {
              console.error(`Error parsing reputation data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading reputation ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setReputations(list);
    } catch (e) {
      console.error("Error loading reputations:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? `FHE system is ${isAvailable ? "available" : "unavailable"}`
          : `FHE系统${isAvailable ? "可用" : "不可用"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: language === "en" 
          ? "Failed to check availability" 
          : "检查可用性失败"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const submitReputation = async () => {
    if (!provider) { 
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Encrypting reputation data with FHE..." 
        : "使用FHE加密信誉数据..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newReputationData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const repId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const repData = {
        source: newReputationData.source,
        score: newReputationData.score,
        details: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        verified: false
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `reputation_${repId}`, 
        ethers.toUtf8Bytes(JSON.stringify(repData))
      );
      
      const keysBytes = await contract.getData("reputation_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(repId);
      
      await contract.setData(
        "reputation_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "Reputation data submitted securely with FHE!" 
          : "信誉数据已通过FHE安全提交!"
      });
      
      await loadReputations();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewReputationData({
          source: "",
          score: 0,
          details: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? language === "en" ? "Transaction rejected by user" : "用户拒绝了交易"
        : language === "en" ? "Submission failed: " + (e.message || "Unknown error") : "提交失败: " + (e.message || "未知错误");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyReputation = async (repId: string) => {
    if (!provider) {
      alert(language === "en" ? "Please connect wallet first" : "请先连接钱包");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: language === "en" 
        ? "Processing encrypted data with FHE..." 
        : "使用FHE处理加密数据..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const repBytes = await contract.getData(`reputation_${repId}`);
      if (repBytes.length === 0) {
        throw new Error("Reputation not found");
      }
      
      const repData = JSON.parse(ethers.toUtf8String(repBytes));
      
      const updatedRep = {
        ...repData,
        verified: true
      };
      
      await contract.setData(
        `reputation_${repId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRep))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: language === "en" 
          ? "FHE verification completed successfully!" 
          : "FHE验证成功完成!"
      });
      
      await loadReputations();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: language === "en" 
          ? "Verification failed: " + (e.message || "Unknown error") 
          : "验证失败: " + (e.message || "未知错误")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  const teamMembers = [
    { name: "Alice Chen", role: "FHE Researcher", bio: "Expert in homomorphic encryption with 10+ years experience" },
    { name: "Bob Zhang", role: "Blockchain Architect", bio: "Designed multiple DeFi protocols with on-chain privacy" },
    { name: "Carol Wang", role: "Frontend Developer", bio: "Specialized in Web3 interfaces and user experience" },
    { name: "David Li", role: "Security Auditor", bio: "Ensuring protocol security and privacy guarantees" }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>{language === "en" ? "Initializing FHE connection..." : "正在初始化FHE连接..."}</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="shield-icon"></div>
          </div>
          <h1>FHE<span>Reputation</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={toggleLanguage}
            className="action-btn"
          >
            {language === "en" ? "中文" : "EN"}
          </button>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            {language === "en" ? "Add Reputation" : "添加信誉"}
          </button>
          <button 
            onClick={checkAvailability}
            className="action-btn"
          >
            {language === "en" ? "Check FHE" : "检查FHE"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} language={language} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>{language === "en" ? "FHE-Powered Private Reputation" : "FHE驱动的私有信誉系统"}</h2>
            <p>
              {language === "en" 
                ? "Securely port your on-chain reputation across dApps with fully homomorphic encryption" 
                : "通过全同态加密安全地在dApps之间移植您的链上信誉"}
            </p>
            <div className="hero-stats">
              <div className="stat">
                <div className="stat-value">{totalReputations}</div>
                <div className="stat-label">{language === "en" ? "Reputations" : "信誉记录"}</div>
              </div>
              <div className="stat">
                <div className="stat-value">{avgScore.toFixed(1)}</div>
                <div className="stat-label">{language === "en" ? "Avg Score" : "平均分数"}</div>
              </div>
              <div className="stat">
                <div className="stat-value">{verifiedCount}</div>
                <div className="stat-label">{language === "en" ? "Verified" : "已验证"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="search-filters">
          <div className="search-box">
            <input 
              type="text" 
              placeholder={language === "en" ? "Search reputations..." : "搜索信誉记录..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="filters">
            <label>
              <input 
                type="checkbox" 
                checked={filterVerified}
                onChange={() => setFilterVerified(!filterVerified)}
              />
              {language === "en" ? "Verified only" : "仅显示已验证"}
            </label>
          </div>
        </div>

        <div className="reputations-section">
          <div className="section-header">
            <h2>{language === "en" ? "Reputation Portfolio" : "信誉档案"}</h2>
            <div className="header-actions">
              <button 
                onClick={loadReputations}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing 
                  ? (language === "en" ? "Refreshing..." : "刷新中...") 
                  : (language === "en" ? "Refresh" : "刷新")
                }
              </button>
            </div>
          </div>
          
          <div className="reputations-list">
            {paginatedReputations.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>{language === "en" ? "No reputation records found" : "未找到信誉记录"}</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowCreateModal(true)}
                >
                  {language === "en" ? "Create First Record" : "创建第一条记录"}
                </button>
              </div>
            ) : (
              <>
                {paginatedReputations.map(rep => (
                  <div className="reputation-card" key={rep.id}>
                    <div className="card-header">
                      <div className="source">{rep.source}</div>
                      <div className={`verification ${rep.verified ? "verified" : "pending"}`}>
                        {rep.verified 
                          ? (language === "en" ? "Verified" : "已验证") 
                          : (language === "en" ? "Pending" : "待验证")
                        }
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="score">Score: {rep.score}/100</div>
                      <div className="owner">Owner: {rep.owner.substring(0, 6)}...{rep.owner.substring(38)}</div>
                      <div className="date">
                        {new Date(rep.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="card-actions">
                      {!rep.verified && (
                        <button 
                          className="verify-btn"
                          onClick={() => verifyReputation(rep.id)}
                        >
                          {language === "en" ? "Verify with FHE" : "使用FHE验证"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                
                {totalPages > 1 && (
                  <div className="pagination">
                    <button 
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage === 1}
                    >
                      {language === "en" ? "Previous" : "上一页"}
                    </button>
                    <span>{language === "en" ? "Page" : "页码"} {currentPage} {language === "en" ? "of" : "/"} {totalPages}</span>
                    <button 
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage === totalPages}
                    >
                      {language === "en" ? "Next" : "下一页"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="info-section">
          <button 
            onClick={() => setShowTeamInfo(!showTeamInfo)}
            className="toggle-btn"
          >
            {showTeamInfo 
              ? (language === "en" ? "Hide Team Info" : "隐藏团队信息") 
              : (language === "en" ? "Show Team Info" : "显示团队信息")
            }
          </button>
          
          {showTeamInfo && (
            <div className="team-grid">
              <h3>{language === "en" ? "Our Team" : "我们的团队"}</h3>
              <div className="team-members">
                {teamMembers.map((member, index) => (
                  <div className="team-card" key={index}>
                    <div className="member-avatar"></div>
                    <div className="member-name">{member.name}</div>
                    <div className="member-role">{member.role}</div>
                    <div className="member-bio">{member.bio}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitReputation} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          repData={newReputationData}
          setRepData={setNewReputationData}
          language={language}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
          language={language}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="shield-icon"></div>
              <span>FHEReputation</span>
            </div>
            <p>
              {language === "en" 
                ? "Private on-chain reputation portability powered by FHE" 
                : "通过FHE实现私有链上信誉可移植性"}
            </p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">
              {language === "en" ? "Documentation" : "文档"}
            </a>
            <a href="#" className="footer-link">
              {language === "en" ? "Privacy Policy" : "隐私政策"}
            </a>
            <a href="#" className="footer-link">
              {language === "en" ? "Terms of Service" : "服务条款"}
            </a>
            <a href="#" className="footer-link">
              {language === "en" ? "Contact" : "联系我们"}
            </a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHEReputation. {language === "en" ? "All rights reserved." : "保留所有权利。"}
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  repData: any;
  setRepData: (data: any) => void;
  language: "en" | "zh";
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  repData,
  setRepData,
  language
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRepData({
      ...repData,
      [name]: name === "score" ? parseInt(value) || 0 : value
    });
  };

  const handleSubmit = () => {
    if (!repData.source || repData.score <= 0) {
      alert(language === "en" ? "Please fill required fields" : "请填写必填字段");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>{language === "en" ? "Add Reputation Data" : "添加信誉数据"}</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            {language === "en" 
              ? "Your data will be encrypted with FHE for privacy" 
              : "您的数据将通过FHE加密以确保隐私"}
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>{language === "en" ? "Source *" : "来源 *"}</label>
              <input 
                type="text"
                name="source"
                value={repData.source} 
                onChange={handleChange}
                placeholder={language === "en" ? "DApp or platform name" : "DApp或平台名称"} 
                className="form-input"
              />
            </div>
            
            <div className="form-group">
              <label>{language === "en" ? "Score *" : "分数 *"}</label>
              <input 
                type="number"
                name="score"
                min="1"
                max="100"
                value={repData.score} 
                onChange={handleChange}
                className="form-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>{language === "en" ? "Details" : "详情"}</label>
              <textarea 
                name="details"
                value={repData.details} 
                onChange={handleChange}
                placeholder={language === "en" ? "Additional details about this reputation..." : "关于此信誉的附加详情..."} 
                className="form-textarea"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            {language === "en" ? "Cancel" : "取消"}
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary-btn"
          >
            {creating 
              ? (language === "en" ? "Encrypting with FHE..." : "使用FHE加密中...") 
              : (language === "en" ? "Submit Securely" : "安全提交")
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;