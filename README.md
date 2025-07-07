# UI/UX Evaluation App - Employee Development Platform

## Project Overview

An AI-powered UI/UX evaluation application designed for employee development. Using Claude and GPT APIs, this application provides comprehensive feedback to support continuous learning and professional growth in UI/UX design.

## Project Structure

```
Replay-design-score-app/
│
├── README.md                    # This file
├── components/                  # Shared React components
│   └── ui-submission-form.tsx
├── lib/                        # Database schemas and utilities
│   ├── database.sql           # Main database schema
│   ├── database-improvements.sql # Additional DB improvements
│   └── supabase.ts           # Supabase client configuration
├── services/                   # AI evaluation service
│   └── ai-evaluation.ts
├── types/                      # TypeScript type definitions
│   └── index.ts
└── ui-ux-evaluation-app/      # Main Next.js application
    ├── package.json
    ├── next.config.ts
    ├── tsconfig.json
    ├── src/
    │   └── app/               # Next.js 15 App Router
    │       ├── api/           # API routes
    │       │   ├── collect-data/
    │       │   └── evaluate/
    │       ├── layout.tsx
    │       ├── page.tsx
    │       └── globals.css
    ├── components/            # Application components
    ├── services/              # Business logic services
    │   ├── ai-evaluation.ts
    │   ├── data-collection.service.ts
    │   ├── image-analysis.service.ts
    │   ├── integrated-evaluation.service.ts
    │   ├── objective-evaluation.service.ts
    │   └── prediction-model.service.ts
    ├── types/                 # Application types
    ├── lib/                   # Application utilities
    ├── public/                # Static assets
    └── n8n-workflows/         # n8n workflow configurations
```

## Key Features

### 1. UI Submission & Evaluation System
- Support for Figma links or image uploads
- AI-powered automatic scoring (7 criteria × 20 points max)
  - Color & Contrast
  - Information Organization & Density
  - Visual Navigation
  - Accessibility
  - UI Consistency & Spacing
  - First Impression & Visual Impact
  - CTA Clarity

### 2. Growth Visualization Dashboard
- Score progression charts
- Category-based performance metrics
- Best practice examples
- Improvement trend analysis

### 3. External Data Collection
- Automated UI gallery data collection
- AI-evaluated benchmark data
- Playwright + n8n automation support

## Technology Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **AI Integration**: Claude API, OpenAI API
- **Visualization**: Chart.js, React Charts
- **File Handling**: React Dropzone, Sharp
- **Icons**: Heroicons

## Setup Instructions

### Prerequisites
- Node.js 18+ and npm
- Supabase account
- Claude API key (Anthropic)
- OpenAI API key

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Replay-design-score-app
```

### 2. Install Dependencies
```bash
cd ui-ux-evaluation-app
npm install
```

### 3. Environment Configuration
Create a `.env.local` file in the `ui-ux-evaluation-app` directory:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI API Keys
ANTHROPIC_API_KEY=your_anthropic_api_key
OPENAI_API_KEY=your_openai_api_key
```

### 4. Database Setup
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Execute the SQL scripts in order:
   - First: `/lib/database.sql` (creates tables, indexes, and RLS policies)
   - Second: `/lib/database-improvements.sql` (if exists, for additional features)

### 5. Run the Application

#### Development Mode
```bash
cd ui-ux-evaluation-app
npm run dev
```
The application will be available at `http://localhost:3000`

#### Production Build
```bash
cd ui-ux-evaluation-app
npm run build
npm start
```

## Available Scripts

From the `ui-ux-evaluation-app` directory:

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## API Endpoints

- `POST /api/evaluate` - Submit UI for evaluation
- `POST /api/collect-data` - Collect external UI data

## Database Schema

### Tables
1. **profiles** - User profiles and role management
2. **ui_submissions** - UI submissions and evaluation results
3. **external_ui_data** - External UI benchmarking data

### Security
- Row Level Security (RLS) enabled
- User-specific data access policies
- Admin role for full data access

## Development Guidelines

1. **Code Structure**: Follow the existing pattern of separating concerns between components, services, and types
2. **Type Safety**: Use TypeScript interfaces for all data structures
3. **Error Handling**: Implement proper error handling in all API routes
4. **State Management**: Use React hooks and context where appropriate
5. **Styling**: Use Tailwind CSS utility classes

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Verify Supabase credentials in `.env.local`
   - Check if database tables are created

2. **AI API Errors**
   - Ensure API keys are valid and have sufficient credits
   - Check rate limits for both Claude and OpenAI

3. **Build Errors**
   - Clear `.next` folder and `node_modules`
   - Run `npm install` again
   - Check TypeScript errors with `npm run build`

## Future Enhancements

- [ ] Slack/Teams notification integration
- [ ] Advanced n8n workflow automation
- [ ] ChromaDB vector search implementation
- [ ] A/B testing functionality
- [ ] Multi-language support
- [ ] Mobile application

## Contributing

Please follow the existing code style and ensure all tests pass before submitting pull requests.

## License

[Add your license information here]