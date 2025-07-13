#!/usr/bin/env node

/**
 * N8N MCP統合サンプル
 * このスクリプトはN8N MCPサーバーとの統合例を示します
 */

const { spawn } = require('child_process');
const readline = require('readline');

class N8NMCP {
  constructor() {
    this.mcpProcess = null;
    this.isInitialized = false;
  }

  /**
   * N8N MCPサーバーを起動
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      console.log('🚀 N8N MCPサーバーを起動中...');
      
      this.mcpProcess = spawn('npx', ['n8n-mcp'], {
        env: {
          ...process.env,
          MCP_MODE: 'stdio',
          LOG_LEVEL: 'error',
          DISABLE_CONSOLE_OUTPUT: 'true',
          N8N_API_URL: 'http://localhost:5678',
          N8N_API_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZWI3YjU0My02NDIxLTQ1MDctYWNkOC0yNDRiYzNlN2EwMjEiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwiaWF0IjoxNzUyMzkwNTQ5fQ.yUP7Ud7vXDRNKkncx34rsdRLF9z4PX3pi41rn34Ni2g'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.mcpProcess.stderr.on('data', (data) => {
        const message = data.toString();
        if (message.includes('MCP Server running')) {
          console.log('✅ N8N MCPサーバーが起動しました');
          this.isInitialized = true;
          resolve();
        }
        console.log('MCP Log:', message);
      });

      this.mcpProcess.on('error', (error) => {
        console.error('❌ MCPサーバー起動エラー:', error);
        reject(error);
      });

      // 初期化メッセージを送信
      setTimeout(() => {
        this.sendMessage({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            clientInfo: {
              name: 'n8n-integration-example',
              version: '1.0.0'
            }
          }
        });
      }, 2000);
    });
  }

  /**
   * MCPサーバーにメッセージを送信
   */
  sendMessage(message) {
    if (!this.mcpProcess) {
      throw new Error('MCPサーバーが初期化されていません');
    }

    const jsonMessage = JSON.stringify(message) + '\n';
    console.log('📤 送信:', message.method || message.id);
    this.mcpProcess.stdin.write(jsonMessage);
  }

  /**
   * N8Nノードの一覧を取得
   */
  async listNodes() {
    return new Promise((resolve) => {
      const id = Date.now();
      
      this.mcpProcess.stdout.once('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          resolve(response.result);
        } catch (error) {
          console.error('レスポンス解析エラー:', error);
          resolve(null);
        }
      });

      this.sendMessage({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'list_nodes',
          arguments: {}
        }
      });
    });
  }

  /**
   * ノード検索
   */
  async searchNodes(query) {
    return new Promise((resolve) => {
      const id = Date.now();
      
      this.mcpProcess.stdout.once('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          resolve(response.result);
        } catch (error) {
          console.error('レスポンス解析エラー:', error);
          resolve(null);
        }
      });

      this.sendMessage({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'search_nodes',
          arguments: { query }
        }
      });
    });
  }

  /**
   * ワークフロー検証
   */
  async validateWorkflow(workflow) {
    return new Promise((resolve) => {
      const id = Date.now();
      
      this.mcpProcess.stdout.once('data', (data) => {
        try {
          const response = JSON.parse(data.toString());
          resolve(response.result);
        } catch (error) {
          console.error('レスポンス解析エラー:', error);
          resolve(null);
        }
      });

      this.sendMessage({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: 'validate_workflow',
          arguments: { workflow: JSON.stringify(workflow) }
        }
      });
    });
  }

  /**
   * MCPサーバーを終了
   */
  shutdown() {
    if (this.mcpProcess) {
      console.log('🛑 MCPサーバーを終了中...');
      this.mcpProcess.kill();
      this.mcpProcess = null;
      this.isInitialized = false;
    }
  }
}

/**
 * メイン実行関数
 */
async function main() {
  const mcp = new N8NMCP();
  
  try {
    // MCPサーバー起動
    await mcp.initialize();
    
    console.log('\n🔍 利用可能なN8Nノードを検索中...');
    
    // AIツール検索
    const aiNodes = await mcp.searchNodes('AI Claude OpenAI');
    console.log('🤖 AI関連ノード:', aiNodes);
    
    // HTTP関連ノード検索
    const httpNodes = await mcp.searchNodes('HTTP Request');
    console.log('🌐 HTTP関連ノード:', httpNodes);
    
    // Webhook関連ノード検索
    const webhookNodes = await mcp.searchNodes('Webhook');
    console.log('📡 Webhook関連ノード:', webhookNodes);

    // サンプルワークフローの検証
    const sampleWorkflow = {
      name: "Sample Claude Integration",
      nodes: [
        {
          id: "webhook-1",
          type: "n8n-nodes-base.webhook",
          name: "Webhook Trigger"
        },
        {
          id: "http-1", 
          type: "n8n-nodes-base.httpRequest",
          name: "Claude API Call"
        }
      ],
      connections: {
        "Webhook Trigger": {
          "main": [[{
            "node": "Claude API Call",
            "type": "main", 
            "index": 0
          }]]
        }
      }
    };

    console.log('\n🔍 ワークフロー検証中...');
    const validationResult = await mcp.validateWorkflow(sampleWorkflow);
    console.log('✅ 検証結果:', validationResult);

  } catch (error) {
    console.error('❌ エラー:', error);
  } finally {
    // クリーンアップ
    mcp.shutdown();
    process.exit(0);
  }
}

// Ctrl+Cでの終了処理
process.on('SIGINT', () => {
  console.log('\n👋 終了中...');
  process.exit(0);
});

// スクリプト実行
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { N8NMCP };