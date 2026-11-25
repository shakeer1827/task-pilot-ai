import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Calendar, MapPin, IndianRupee, Users, ArrowRight, AlertCircle } from 'lucide-react';
import { apiClient } from '../api/client';
import { AppLayout } from '../components/AppLayout';

const SAMPLE_GOAL = {
  title: 'College Cultural Event (200 Students)',
  description: 'Organize a college cultural event for 200 students next Saturday with a budget of ₹50,000.',
  location: 'Bengaluru',
  budget: '50000',
  participants: '200',
  additional_instructions: 'Prefer an outdoor campus amphitheater if weather is favorable, otherwise reserve indoor auditorium backup.',
};

export default function GoalCreatePage() {
  const navigate = useNavigate();

  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [budget, setBudget] = useState('');
  const [participants, setParticipants] = useState('');
  const [additionalInstructions, setAdditionalInstructions] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSampleGoal = () => {
    const nextSat = new Date();
    const daysToSat = (6 - nextSat.getDay() + 7) % 7 || 7;
    nextSat.setDate(nextSat.getDate() + daysToSat);

    setTitle(SAMPLE_GOAL.title);
    setDescription(SAMPLE_GOAL.description);
    setLocation(SAMPLE_GOAL.location);
    setEventDate(nextSat.toISOString().slice(0, 10));
    setBudget(SAMPLE_GOAL.budget);
    setParticipants(SAMPLE_GOAL.participants);
    setAdditionalInstructions(SAMPLE_GOAL.additional_instructions);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const goalRes = await apiClient.post('/goals', {
        title: title.trim() || undefined,
        description: description.trim(),
        event_date: eventDate || null,
        location: location.trim() || null,
        budget: budget ? Number(budget) : null,
        participants: participants ? Number(participants) : null,
        additional_instructions: additionalInstructions.trim() || null,
      });

      const goal = goalRes.data.goal;
      const planRes = await apiClient.post('/plans/generate', {
        goalId: goal.id,
      });

      navigate(`/plans/${planRes.data.plan.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create New Autonomous Goal</h1>
            <p className="mt-1 text-sm text-slate-600">
              Describe your objective in plain language. The Planner agent will detect gaps and build an editable plan.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSampleGoal}
            className="btn-secondary shrink-0 border-blue-200 bg-blue-50/70 text-blue-700 hover:bg-blue-50"
          >
            <Sparkles className="h-4 w-4" />
            Load Hackathon Sample Goal
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="card space-y-6 p-6 sm:p-8">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-800">
              Goal Description <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input-field resize-y text-base"
              placeholder="Describe what you want your AI agent to accomplish..."
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Example: “I want to organize a college cultural event for 200 students next Saturday with a budget of ₹50,000.”
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Short Goal Title (Optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field"
              placeholder="Auto-derived from goal description if left blank"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Calendar className="h-4 w-4 text-slate-400" />
                Event Date (Optional)
              </label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="input-field"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" />
                Location / City (Optional)
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="input-field"
                placeholder="e.g., Bengaluru, Mumbai, Pune"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <IndianRupee className="h-4 w-4 text-slate-400" />
                Budget Limit (Optional)
              </label>
              <input
                type="number"
                min="1"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                className="input-field"
                placeholder="e.g., 50000"
              />
            </div>

            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
                <Users className="h-4 w-4 text-slate-400" />
                Expected Participants (Optional)
              </label>
              <input
                type="number"
                min="1"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                className="input-field"
                placeholder="e.g., 200"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Additional Instructions (Optional)</label>
            <textarea
              rows={2}
              value={additionalInstructions}
              onChange={(e) => setAdditionalInstructions(e.target.value)}
              className="input-field"
              placeholder="Venue preferences, dietary notes, acoustic constraints..."
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 pt-5">
            <p className="text-xs text-slate-500">
              Leaving optional fields blank? The agent will identify missing details and ask follow-up questions.
            </p>
            <button type="submit" disabled={loading} className="btn-primary px-6 py-2.5">
              {loading ? 'Analyzing Goal & Generating Plan...' : 'Generate Execution Plan'}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
