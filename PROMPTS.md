Here is the prompts as the generator of agent@_@!!

> STEP1: Generate the basic info of the AI Agent.
>
> ↓
>
> STEP2: Register the AI Agent in the AI Agent Market.
>
> ↓
>
> STEP3: Register MoveDID for AI Agent on Movement(Optional).
>
> ↓
>
> STEP4: Generate the .env file.
>
> ↓
>
> STEP5: Generate a Chatbot for your Agent.
>
> ↓
>
> STEP6: Deploy the agent on the Vercel.
>
> Got your online AI Agent!

## STEP1: Generate the basic info of the AI Agent.

**Prompt:**
```
You are helping to create an AI Agent Worker that can earn tokens through the x402 payment protocol on Movement blockchain. 

Please generate the following basic information for the AI Agent:

1. **Agent Name**: 
   - Provide a creative and descriptive name (can be bilingual: English/Chinese)
   - Example: "轻量程序生成大师LeanCoder" or "Hackathon Project Analyzer"

2. **Agent Description**: 
   - Write a clear description of what the agent does (in English)
   - Optionally include a Chinese translation
   - Should explain the agent's core functionality and value proposition
   - Example: "Generate a micro program as a real human programmer / 像人类工程师一样帮你生成轻量级的程序。"

3. **Agent Tags**: 
   - Provide 2-3 relevant tags/categories (e.g., "Coder", "Web3er", "Designer", "Analyst")
   - These will be displayed as badges on the agent profile

4. **Agent Avatar**: 
   - Specify the avatar image filename (should be placed in scaffold-worker/public/ directory)
   - Example: "avatar.png"

5. **Agent Movement Address**: 
   - The blockchain address where the agent will receive payments
   - Format: 0x followed by 64 hex characters
   - Example: "0x5cf8ed0e6b49da5d87ba69c4e50aa9b78c57bf0dd446f9889c8f8b5e57b0f336"
   - If you don't have one yet, generate a placeholder address or leave it for later configuration

6. **Agent Free Tier Description**: 
   - Describe what users can access for free (the chatbot functionality)
   - Example: "Chat with the LeanCoder for free. Generate the micro program automatically!"

7. **Agent Premium Tier Description**: 
   - Describe what users get when they pay (the premium content/coupon functionality)
   - Include example use cases or prompts
   - Example: "Unlock an exclusive coupon by making a micro-payment through the x402 protocol. Use Coupon, the agent could solve more complex tasks compared to the free tier."

**Output Format:**
Provide all information in a structured format that can be easily integrated into the scaffold-worker/app/page.tsx file. Update the AGENT_ADDRESS constant and the agent profile card section with the generated information.
```

## STEP2: Register the AI Agent in the AI Agent Market.

**Prompt:**
```
You have created an AI Agent Worker with basic information. Now you need to register it in the AI Agent Market so others can discover and use your agent.

**Steps to Register:**

1. **Prepare Agent Information**:
   - Agent Name (from STEP1)
   - Agent Description (from STEP1)
   - Agent Tags/Categories (from STEP1)
   - Agent Movement Address (from STEP1)
   - Agent Avatar Image URL (hosted publicly or via your deployed frontend)
   - Agent Frontend URL (will be available after STEP5 deployment)
   - Free Tier Chatbot URL (from STEP4)
   - Pricing Information (e.g., "1 $MOVE for Premium Tier")

2. **Navigate to AI Agent Market**:
   - Go to: https://agent-market.leeduckgo.com/agents
   - Click "Register Agent" or "Add Agent" button (if available)
   - Or contact the market administrator if registration requires approval

3. **Fill Registration Form**:
   - Enter all prepared information
   - Upload or provide URL for agent avatar
   - Specify the agent's capabilities and use cases
   - Provide links to:
     - Frontend landing page (after deployment in STEP5)
     - Free chatbot interface (from STEP4)
     - Documentation or API endpoints (if applicable)

4. **Verification & Approval**:
   - Wait for market administrator approval (if required)
   - Ensure all links are working and accessible
   - Test the agent functionality before final submission

5. **Update Your Frontend**:
   - Add link to your agent's market listing in scaffold-worker/app/page.tsx
   - Update the agent market link section to include your specific agent URL
   - Ensure consistency between market listing and frontend information

**Note:** If the agent market has a specific API or submission format, follow their documentation. Otherwise, use the web interface at https://agent-market.leeduckgo.com/agents.
```

## STEP3: Register MoveDID for AI Agent on Movement(Optional).

TODO.

## STEP4: Generate the .env file.

**Prompt:**
```
You need to configure environment variables for both the frontend and backend of your AI Agent Worker.

**For Frontend (scaffold-worker/.env.local):**

Create a file at `scaffold-worker/.env.local` with the following content:

```bash
# x402 Server URL
# For local development, use: http://localhost:4403
# For production, use: https://x402.leeduckgo.com
NEXT_PUBLIC_X402_SERVER_URL=http://localhost:4403
```

**For Backend (deno-server/.env or environment variables):**

Set the following environment variables in your shell or create a `.env` file in the `deno-server/` directory:

```bash
# Required: Movement blockchain wallet address to receive payments
# This should be your agent's payment wallet address (the MOVEMENT_PAY_TO address)
MOVEMENT_PAY_TO=0xYourMovementWalletAddress

# Optional: Server port (defaults to 4403 if not set)
PORT=4403

# Optional: Facilitator URL for x402 protocol payment verification
# Default: https://facilitator.stableyard.fi
FACILITATOR_URL=https://facilitator.stableyard.fi
```

**Instructions:**

1. **Generate Frontend .env.local**:
   - Navigate to `scaffold-worker/` directory
   - Create `.env.local` file (this file is already in .gitignore and won't be committed)
   - Add the `NEXT_PUBLIC_X402_SERVER_URL` variable
   - Use `http://localhost:4403` for local development
   - Use `https://x402.leeduckgo.com` for production (after backend deployment)

2. **Configure Backend Environment Variables**:
   - Option A: Export in your shell session:
     ```bash
     export MOVEMENT_PAY_TO="0xYourActualWalletAddress"
     export PORT=4403
     ```
   - Option B: Create `.env` file in `deno-server/` directory (if your Deno setup supports it)
   - Option C: Set in your deployment platform (Deno Deploy, Vercel, etc.)

3. **Verify Configuration**:
   - Ensure `MOVEMENT_PAY_TO` matches the wallet address you want to receive payments
   - Ensure `NEXT_PUBLIC_X402_SERVER_URL` in frontend matches your backend server URL
   - Test the connection between frontend and backend

4. **Security Notes**:
   - Never commit `.env.local` or `.env` files to git (they're already in .gitignore)
   - For production deployments, set environment variables in your deployment platform's settings
   - Keep your wallet private keys secure and never expose them in environment variables

**Example Complete Setup:**

Frontend (`scaffold-worker/.env.local`):
```bash
NEXT_PUBLIC_X402_SERVER_URL=http://localhost:4403
```

Backend (shell environment or deployment platform):
```bash
MOVEMENT_PAY_TO=0x5cf8ed0e6b49da5d87ba69c4e50aa9b78c57bf0dd446f9889c8f8b5e57b0f336
PORT=4403
```
## STEP5: Generate a Chatbot for your Agent.

**Prompt:**

You need to create a chatbot interface for your AI Agent's free tier functionality. This chatbot will be accessible to all users without payment.

**Option 1: Using ChatGPT GPTs (Recommended for Quick Setup)**

1. **Create a Custom GPT**:
   - Go to https://chat.openai.com/ and navigate to GPT creation
   - Or use direct link: https://chatgpt.com/gpts/editor
   - Click "Create a GPT" button

2. **Configure Your GPT**:
   - **Name**: Use your agent's name (from STEP1)
   - **Description**: Use your agent's description (from STEP1)
   - **Instructions**: Provide detailed instructions on how the chatbot should behave:
     ```
     You are [Agent Name], an AI agent that [Agent Description].
     
     Your capabilities include:
     - [Capability 1]
     - [Capability 2]
     - [Capability 3]
     
     Guidelines:
     - [Guideline 1]
     - [Guideline 2]
     
     Remember to [specific behavior or constraints].
     ```
   - **Conversation Starters**: Add 3-5 example prompts users can click
   - **Knowledge**: Upload any relevant files or documentation
   - **Capabilities**: Enable Code Interpreter, Web Browsing, or DALL-E as needed

3. **Publish Your GPT**:
   - Save and publish your GPT
   - Copy the public URL (format: https://chatgpt.com/g/g-XXXXXXXXX-agent-name)
   - This URL will be used in your frontend

4. **Update Frontend**:
   - In `scaffold-worker/app/page.tsx`, update the chatbot link:
     ```tsx
     <a
       href="YOUR_CHATGPT_GPT_URL"
       target="_blank"
       rel="noopener noreferrer"
       className="..."
     >
       [Your Agent Name] ChatBot
       <ExternalLink className="h-4 w-4" />
     </a>
     ```

**Option 2: Custom Chatbot Implementation (Advanced)**

If you want full control, implement a custom chatbot:

1. **Choose a Framework**:
   - OpenAI Chat Completions API
   - Anthropic Claude API
   - LangChain with custom LLM
   - Or other AI service provider

2. **Implement Chat Interface**:
   - Create a chat component in `scaffold-worker/components/`
   - Use React state management for conversation history
   - Integrate with your chosen AI API
   - Handle streaming responses if desired

3. **Add to Frontend**:
   - Create a route: `scaffold-worker/app/chat/page.tsx`
   - Implement the chat UI with message bubbles, input field, send button
   - Style with Tailwind CSS to match your existing design

4. **Environment Variables**:
   - Add API keys to `.env.local`:
     ```bash
     OPENAI_API_KEY=sk-...  # or your chosen provider's key
     ```

**Option 3: Embed External Chatbot Service**

Use services like:
- Voiceflow
- Tawk.to
- Crisp
- Intercom

And embed the widget in your frontend.

**Recommended Approach:**
For a scaffold/prototype, use Option 1 (ChatGPT GPTs) as it's the fastest to set up and requires no additional infrastructure. For production with custom behavior, use Option 2.

**After Creating Chatbot:**

1. Test the chatbot thoroughly with various prompts
2. Ensure it aligns with your agent's description and capabilities
3. Update the free tier section in your frontend with the chatbot link
4. Document the chatbot URL in your agent market registration (STEP2)
## STEP6: Deploy the agent on the Vercel.

**Prompt:**

You are ready to deploy your AI Agent Worker frontend to Vercel for public access.

**Prerequisites:**

- ✅ Frontend code is complete and tested locally
- ✅ Backend server is deployed (Deno Deploy or other hosting)
- ✅ Environment variables are configured
- ✅ Chatbot is created and accessible (STEP4)
- ✅ Agent is registered in the market (STEP2, optional but recommended)

**Deployment Steps:**

1. **Prepare Your Repository**:
   ```bash
   # Ensure all changes are committed
   git add .
   git commit -m "Prepare for deployment"
   git push origin main
   ```

2. **Deploy Backend First** (if not already deployed):
   - Go to https://dash.deno.com
   - Click "New Project"
   - Import from GitHub repository
   - Select your repository
   - Set root directory to: `deno-server/`
   - Set entry point to: `main.tsx`
   - Configure environment variables:
     - `MOVEMENT_PAY_TO`: Your wallet address
     - `PORT`: 4403 (or leave default)
     - `FACILITATOR_URL`: https://facilitator.stableyard.fi
   - Deploy and note the deployment URL (e.g., `https://your-server.deno.dev`)

3. **Deploy Frontend on Vercel**:
   
   **Option A: Via Vercel Dashboard (Recommended)**
   
   a. Go to https://vercel.com and sign in
   
   b. Click "Add New Project"
   
   c. Import your GitHub repository
   
   d. Configure project settings:
      - **Framework Preset**: Next.js
      - **Root Directory**: `scaffold-worker/` (important!)
      - **Build Command**: `npm run build` (or `cd scaffold-worker && npm run build`)
      - **Output Directory**: `.next` (default for Next.js)
      - **Install Command**: `npm install` (or `cd scaffold-worker && npm install`)
   
   e. Set Environment Variables:
      - Click "Environment Variables" section
      - Add: `NEXT_PUBLIC_X402_SERVER_URL`
      - Value: Your backend server URL (from step 2) or `https://x402.leeduckgo.com` if using public server
      - Apply to: Production, Preview, Development
   
   f. Click "Deploy"
   
   g. Wait for build to complete (usually 1-3 minutes)
   
   h. Your site will be available at: `https://your-project.vercel.app`
   
   **Option B: Via Vercel CLI**
   
   ```bash
   # Install Vercel CLI
   npm i -g vercel
   
   # Navigate to frontend directory
   cd scaffold-worker
   
   # Login to Vercel
   vercel login
   
   # Deploy
   vercel
   
   # For production deployment
   vercel --prod
   ```

4. **Configure Custom Domain (Optional)**:
   - In Vercel project settings, go to "Domains"
   - Add your custom domain
   - Configure DNS records as instructed by Vercel
   - Wait for SSL certificate provisioning

5. **Verify Deployment**:
   - Visit your deployed URL
   - Test all functionality:
     - ✅ Agent profile displays correctly
     - ✅ Free chatbot link works
     - ✅ Wallet connection works
     - ✅ Payment flow works (test with testnet)
     - ✅ Premium content access works after payment
   - Check browser console for errors
   - Test on mobile devices

6. **Update Configuration**:
   - Update `AGENT_ADDRESS` in deployed code if needed (or make it environment variable)
   - Update chatbot URL if changed
   - Update agent market registration with final frontend URL
   - Update any hardcoded URLs to use environment variables

7. **Monitor and Maintain**:
   - Set up Vercel Analytics (optional)
   - Monitor error logs in Vercel dashboard
   - Set up uptime monitoring
   - Configure alerts for deployment failures

**Environment Variables for Vercel:**

In Vercel dashboard → Settings → Environment Variables, ensure:

```
NEXT_PUBLIC_X402_SERVER_URL = https://your-backend-server.deno.dev
```

Or use the public server:
```
NEXT_PUBLIC_X402_SERVER_URL = https://x402.leeduckgo.com
```

**Post-Deployment Checklist:**
- [ ] Frontend is accessible at Vercel URL
- [ ] All environment variables are set correctly
- [ ] Backend server is deployed and accessible
- [ ] Frontend can communicate with backend
- [ ] Free chatbot link works
- [ ] Wallet connection works
- [ ] Payment flow works (test thoroughly)
- [ ] Mobile responsive design works
- [ ] No console errors
- [ ] Agent market listing updated with production URL
- [ ] Custom domain configured (if applicable)

**Troubleshooting:**

- **Build Fails**: Check build logs, ensure all dependencies are in package.json
- **404 Errors**: Verify root directory is set to `scaffold-worker/`
- **Environment Variables Not Working**: Ensure they start with `NEXT_PUBLIC_` for client-side access
- **Backend Connection Issues**: Verify CORS is configured correctly on backend
- **Payment Not Working**: Check backend URL is correct and server is running

**Production Best Practices:**
- Enable Vercel Analytics for usage tracking
- Set up error tracking (Sentry, etc.)
- Configure CDN caching for static assets
- Enable automatic HTTPS
- Set up staging environment for testing before production
---
**Usage Instructions:**
Each step above contains a detailed prompt that can be used with an AI assistant (like ChatGPT, Claude, or Cursor AI) to guide you through creating and deploying your AI Agent Worker. Follow the steps sequentially, as each step builds upon the previous one.