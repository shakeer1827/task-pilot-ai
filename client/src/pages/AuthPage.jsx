import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Bot, ArrowLeft, FlaskConical, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage({ mode = 'login' }) {
  const isRegister = mode === 'register';
  const { login, register, loginDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isRegister) {
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginDemo();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-md">
        <Link to="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Back to TaskPilot AI
        </Link>

        <div className="card p-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Bot className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {isRegister ? 'Create your account' : 'Sign in to TaskPilot AI'}
              </h1>
              <p className="text-xs text-slate-500">
                {isRegister ? 'Start planning autonomous event workflows' : 'Access your autonomous planning workspace'}
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {isRegister && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                  placeholder="Aarav Sharma"
                />
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@college.edu"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                required
                minLength={isRegister ? 8 : 1}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder={isRegister ? 'Minimum 8 characters' : 'Enter your password'}
              />
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full py-2.5">
              {submitting ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs font-medium text-slate-400">OR EVALUATE</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleDemoLogin}
            className="btn-secondary w-full border-violet-200 bg-violet-50/50 text-violet-700 hover:bg-violet-50"
          >
            <FlaskConical className="h-4 w-4" />
            Use Isolated Hackathon Demo Account
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Demo account is isolated from personal accounts and runs real backend agents & tools.
          </p>

          <p className="mt-6 text-center text-sm text-slate-600">
            {isRegister ? (
              <>
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-blue-600 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                Need an account?{' '}
                <Link to="/register" className="font-semibold text-blue-600 hover:underline">
                  Create one
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
