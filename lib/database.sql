-- ユーザープロファイルテーブル
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- UI提出テーブル
CREATE TABLE ui_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  figma_link TEXT,
  image_url TEXT,
  scores JSONB NOT NULL,
  feedback TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 外部UI収集データテーブル
CREATE TABLE external_ui_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  image_url TEXT NOT NULL,
  scores JSONB NOT NULL,
  collected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックス作成
CREATE INDEX idx_ui_submissions_user_id ON ui_submissions(user_id);
CREATE INDEX idx_ui_submissions_created_at ON ui_submissions(created_at);
CREATE INDEX idx_ui_submissions_total_score ON ui_submissions(total_score);
CREATE INDEX idx_external_ui_data_source ON external_ui_data(source);
CREATE INDEX idx_external_ui_data_collected_at ON external_ui_data(collected_at);

-- RLS (Row Level Security) 設定
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ui_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_ui_data ENABLE ROW LEVEL SECURITY;

-- プロファイル用RLSポリシー
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- UI提出用RLSポリシー
CREATE POLICY "Users can view own submissions" ON ui_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own submissions" ON ui_submissions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own submissions" ON ui_submissions FOR UPDATE
  USING (auth.uid() = user_id);

-- 管理者用ポリシー（全データ閲覧可能）
CREATE POLICY "Admins can view all submissions" ON ui_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 外部データは全員閲覧可能
CREATE POLICY "Anyone can view external ui data" ON external_ui_data FOR SELECT
  TO authenticated USING (true);

-- プロファイル自動作成用関数
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', 'Unknown User'));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- プロファイル自動作成用トリガー
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();