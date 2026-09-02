-- Supabase PostgreSQL Schema for AI-Driven Endurance Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Athlete profiles & Strava tokens
CREATE TABLE IF NOT EXISTS public.athlete_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    strava_athlete_id BIGINT UNIQUE,
    strava_access_token TEXT,
    strava_refresh_token TEXT,
    strava_token_expires_at BIGINT,
    rest_hr INTEGER NOT NULL DEFAULT 60,
    max_hr INTEGER NOT NULL DEFAULT 190,
    gender TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female')),
    weight_kg NUMERIC(5,2) DEFAULT 70.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Activities & TRIMP telemetry
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    strava_activity_id BIGINT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    elapsed_time INTEGER NOT NULL,
    moving_time INTEGER NOT NULL,
    distance NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_elevation_gain NUMERIC(8,2) NOT NULL DEFAULT 0,
    average_heartrate NUMERIC(5,2),
    max_heartrate NUMERIC(5,2),
    trimp_score NUMERIC(8,2) NOT NULL DEFAULT 0,
    streams_summary JSONB,
    raw_streams JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Daily aggregated training loads & ACWR
CREATE TABLE IF NOT EXISTS public.daily_training_loads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    daily_trimp NUMERIC(8,2) NOT NULL DEFAULT 0,
    acute_load_7d NUMERIC(8,2) NOT NULL DEFAULT 0,
    chronic_load_28d NUMERIC(8,2) NOT NULL DEFAULT 0,
    acwr NUMERIC(5,3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, date)
);

-- AI Recovery & Workout Recommendations
CREATE TABLE IF NOT EXISTS public.ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    readiness_score INTEGER NOT NULL,
    injury_risk_level TEXT NOT NULL,
    recovery_status TEXT NOT NULL,
    recommended_workout JSONB NOT NULL,
    coaching_rationale TEXT NOT NULL,
    raw_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON public.activities(user_id, start_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_loads_user_date ON public.daily_training_loads(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_athlete_strava_id ON public.athlete_profiles(strava_athlete_id);

-- Row Level Security (RLS)
ALTER TABLE public.athlete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_training_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Athlete Profiles Policies
CREATE POLICY "Users can view own profile"
    ON public.athlete_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
    ON public.athlete_profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
    ON public.athlete_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Activities Policies
CREATE POLICY "Users can view own activities"
    ON public.activities FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own activities"
    ON public.activities FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Daily Training Loads Policies
CREATE POLICY "Users can view own loads"
    ON public.daily_training_loads FOR SELECT
    USING (auth.uid() = user_id);

-- AI Recommendations Policies
CREATE POLICY "Users can view own recommendations"
    ON public.ai_recommendations FOR SELECT
    USING (auth.uid() = user_id);
