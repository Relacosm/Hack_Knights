import React, { useState, useEffect } from 'react';
import { Upload, FileText, MessageSquare, Scale, Clock, CheckCircle, AlertTriangle, Send, Loader, User, Calendar, Download } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';

const App = () => {
  const [activeTab, setActiveTab] = useState('submit');
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState(null);

  // Form state for new dispute
  const [disputeForm, setDisputeForm] = useState({
    title: '',
    description: '',
    category: 'contract',
    amount: '',
    parties: { plaintiff: '', defendant: '' },
    evidence: []
  });

  // Chat state
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    fetchDisputes();
  }, []);

  const updateDisputeStatus = async (disputeId, newStatus) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/disputes/${disputeId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        // Refresh the disputes list to show the new status
        fetchDisputes();
        
        // If we are on the mediation page, update the selected dispute as well
        if (selectedDispute && selectedDispute.id === disputeId) {
          setSelectedDispute(prev => ({ ...prev, status: newStatus }));
        }
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
    setLoading(false);
  };

  const fetchDisputes = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/disputes');
      const data = await response.json();
      setDisputes(data);
    } catch (error) {
      console.error('Error fetching disputes:', error);
    }
  };

  const downloadSuggestionsAsPDF = (dispute) => {
    if (!dispute) return;

    // 1. Initialize the PDF document
    const doc = new jsPDF();

    // 2. Set properties and add content
    doc.setFontSize(18);
    doc.text('Settlement Suggestions Report', 14, 22);

    doc.setFontSize(12);
    doc.text(`Dispute Title: ${dispute.title}`, 14, 32);
    doc.text(`Parties: ${dispute.parties?.plaintiff} vs ${dispute.parties?.defendant}`, 14, 40);
    doc.text(`Amount: $${dispute.amount || 'N/A'}`, 14, 48);

    doc.line(14, 55, 196, 55); // A horizontal line separator

    doc.setFontSize(14);
    doc.text('AI-Generated Settlement Suggestions:', 14, 65);

    doc.setFontSize(11);
    let yPosition = 75; // Starting Y position for the list of suggestions

    dispute.settlement_suggestions.forEach((suggestion, index) => {
      // jsPDF doesn't auto-wrap text, so we use splitTextToSize to handle long lines
      const textLines = doc.splitTextToSize(`• ${suggestion}`, 180); // 180 is the max width
      
      doc.text(textLines, 16, yPosition);
      
      // Increment yPosition for the next suggestion based on the number of lines
      yPosition += (textLines.length * 5) + 5; 
    });

    // 3. Save the PDF with a dynamic filename
    doc.save(`settlement-suggestions-${dispute.id}.pdf`);
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    setDisputeForm(prev => ({
      ...prev,
      evidence: [...prev.evidence, ...files]
    }));
  };

  const submitDispute = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('title', disputeForm.title);
      formData.append('description', disputeForm.description);
      formData.append('category', disputeForm.category);
      formData.append('amount', disputeForm.amount);
      formData.append('parties', JSON.stringify(disputeForm.parties));
      
      disputeForm.evidence.forEach((file, index) => {
        formData.append(`evidence_${index}`, file);
      });

      const response = await fetch('http://localhost:5000/api/disputes', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        setDisputeForm({
          title: '',
          description: '',
          category: 'contract',
          amount: '',
          parties: { plaintiff: '', defendant: '' },
          evidence: []
        });
        fetchDisputes();
        setActiveTab('track');
      }
    } catch (error) {
      console.error('Error submitting dispute:', error);
    }
    setLoading(false);
  };

  const requestMediation = async (disputeId) => {
    setLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/disputes/${disputeId}/mediate`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Mediation result:', result); // Debug log
        setSelectedDispute(prev => ({
          ...prev,
          ai_analysis: result.analysis,
          settlement_suggestions: result.suggestions || result.settlement_suggestions,
          status: 'mediated'
        }));
        fetchDisputes();
      }
    } catch (error) {
      console.error('Error requesting mediation:', error);
    }
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedDispute) return;

    const userMessage = { sender: 'user', content: newMessage, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setLoading(true);

    try {
      const response = await fetch(`http://localhost:5000/api/disputes/${selectedDispute.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage })
      });

      if (response.ok) {
        const result = await response.json();
        const aiMessage = { sender: 'ai', content: result.response, timestamp: new Date() };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
    }
    setLoading(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'under_review': return 'bg-yellow-100 text-yellow-800';
      case 'mediated': return 'bg-green-100 text-green-800';
      case 'resolved': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'submitted': return <Clock className="w-4 h-4" />;
      case 'under_review': return <AlertTriangle className="w-4 h-4" />;
      case 'mediated': return <Scale className="w-4 h-4" />;
      case 'resolved': return <CheckCircle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <Scale className="w-8 h-8 text-indigo-600" />
              <h1 className="text-2xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Settleकरो
              </span>
            </h1>
            </div>
            <nav className="flex space-x-8">
              {['submit', 'track', 'mediate'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 hover:text-indigo-600 hover:bg-indigo-50'
                  }`}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Submit Dispute Tab */}
        {activeTab === 'submit' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit New Dispute</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Dispute Title</label>
                  <input
                    type="text"
                    value={disputeForm.title}
                    onChange={(e) => setDisputeForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                    placeholder="Brief description of the dispute"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select
                    value={disputeForm.category}
                    onChange={(e) => setDisputeForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                  >
                    <option value="contract">Contract Dispute</option>
                    <option value="payment">Payment Dispute</option>
                    <option value="property">Property Dispute</option>
                    <option value="employment">Employment Dispute</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Amount in Dispute ($)</label>
                  <input
                    type="number"
                    value={disputeForm.amount}
                    onChange={(e) => setDisputeForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                    placeholder="0.00"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Plaintiff</label>
                    <input
                      type="text"
                      value={disputeForm.parties.plaintiff}
                      onChange={(e) => setDisputeForm(prev => ({ 
                        ...prev, 
                        parties: { ...prev.parties, plaintiff: e.target.value }
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                      placeholder="Your name/company"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Defendant</label>
                    <input
                      type="text"
                      value={disputeForm.parties.defendant}
                      onChange={(e) => setDisputeForm(prev => ({ 
                        ...prev, 
                        parties: { ...prev.parties, defendant: e.target.value }
                      }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                      placeholder="Other party name"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={disputeForm.description}
                    onChange={(e) => setDisputeForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                    placeholder="Detailed description of the dispute, timeline, and relevant facts..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Evidence Files</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 mb-2">Upload contracts, emails, photos, or other evidence</p>
                    <input
                      type="file"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      id="evidence-upload"
                    />
                    <label
                      htmlFor="evidence-upload"
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-indigo-700 transition-colors"
                    >
                      Choose Files
                    </label>
                  </div>
                  
                  {disputeForm.evidence.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {disputeForm.evidence.map((file, index) => (
                        <div key={index} className="flex items-center space-x-2 text-sm text-gray-600">
                          <FileText className="w-4 h-4" />
                          <span>{file.name}</span>
                          <span className="text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={submitDispute}
                disabled={loading}
                className="bg-indigo-600 text-white px-8 py-3 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
              >
                {loading && <Loader className="w-4 h-4 animate-spin" />}
                <span>Submit Dispute</span>
              </button>
            </div>
          </div>
        )}

        {/* Track Disputes Tab */}
        {activeTab === 'track' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Track Your Disputes</h2>
            
            {disputes.length === 0 ? (
              <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No disputes found. Submit your first dispute to get started.</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {disputes.map((dispute) => (
                  <div key={dispute.id} className="bg-white rounded-xl shadow-lg p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">{dispute.title}</h3>
                        <p className="text-gray-600 mb-2">{dispute.description}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <div className="flex items-center space-x-1">
                            <User className="w-4 h-4" />
                            <span>{dispute.parties?.plaintiff} vs {dispute.parties?.defendant}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="w-4 h-4" />
                            <span>{new Date(dispute.created_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium flex items-center space-x-1 ${getStatusColor(dispute.status)}`}>
                          {getStatusIcon(dispute.status)}
                          <span>{dispute.status.replace('_', ' ').toUpperCase()}</span>
                        </span>
                        {dispute.amount && (
                          <span className="text-lg font-semibold text-green-600">${dispute.amount}</span>
                        )}
                      </div>
                    </div>
                    
                    {dispute.evidence_texts && dispute.evidence_texts.length > 0 && (
  <div className="mb-4">
    <p className="text-sm font-medium text-gray-700 mb-2">Evidence Text:</p>
    <div className="space-y-4">
      {dispute.evidence_texts.map((text, index) => (
        <div key={index} className="bg-gray-100 p-3 rounded-lg border border-gray-200">
          <pre className="whitespace-pre-wrap text-sm text-gray-800 font-sans">
            {text}
          </pre>
        </div>
      ))}
    </div>
  </div>
)}
                    
                    <div className="flex justify-end space-x-3">
  {/* The new "Mark as Resolved" button */}
  {dispute.status !== 'resolved' && (
    <button
      onClick={() => updateDisputeStatus(dispute.id, 'resolved')}
      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
    >
      Mark as Resolved
    </button>
  )}

  <button
    onClick={() => {
      setSelectedDispute(dispute);
      setActiveTab('mediate');
    }}
    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
  >
    View Details
  </button>
</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mediation Tab */}
        {activeTab === 'mediate' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {selectedDispute ? (
                <>
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Mediation</h2>
                    <div className="border-b pb-4 mb-4">
                      <h3 className="text-lg font-semibold text-gray-800">{selectedDispute.title}</h3>
                      <p className="text-gray-600 mt-2">{selectedDispute.description}</p>
                    </div>
                    
                    {selectedDispute.ai_analysis && (
  <div className="mb-6">
    <h4 className="font-semibold text-gray-800 mb-2">AI Analysis:</h4>
    <div className="bg-blue-50 p-4 rounded-lg text-gray-700">
      {/* Use ReactMarkdown instead of a <p> tag */}
      <ReactMarkdown>{selectedDispute.ai_analysis}</ReactMarkdown>
    </div>
  </div>
)}
                    
                    {selectedDispute.settlement_suggestions && (
  <div className="mb-6">
    {/* Container for the heading and the new button */}
    <div className="flex justify-between items-center mb-2">
      <h4 className="font-semibold text-gray-800">Settlement Suggestions:</h4>
      
      {/* --- DOWNLOAD PDF BUTTON --- */}
      <button
        onClick={() => downloadSuggestionsAsPDF(selectedDispute)}
        className="flex items-center space-x-2 bg-blue-600 text-white px-3 py-1 rounded-lg hover:bg-blue-700 transition-colors text-sm"
      >
        <Download className="w-4 h-4" />
        <span>Download PDF</span>
      </button>
    </div>

                        {/* The rest of the original component to display the suggestions */}
                        <div className="bg-green-50 p-4 rounded-lg">
                          {Array.isArray(selectedDispute.settlement_suggestions) ? (
                            <ul className="space-y-4">
                              {selectedDispute.settlement_suggestions.map((suggestion, index) => (
                                <li key={index} className="text-gray-700">
                                  <ReactMarkdown>{`• ${suggestion}`}</ReactMarkdown>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="text-gray-700 whitespace-pre-line">
                              {selectedDispute.settlement_suggestions}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {!selectedDispute.ai_analysis && (
                      <button
                        onClick={() => requestMediation(selectedDispute.id)}
                        disabled={loading}
                        className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {loading && <Loader className="w-4 h-4 animate-spin" />}
                        <Scale className="w-4 h-4" />
                        <span>Request AI Mediation</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Chat Interface */}
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                      <MessageSquare className="w-5 h-5" />
                      <span>Chat with AI Mediator</span>
                    </h3>
                    
                    <div className="h-96 border rounded-lg p-4 overflow-y-auto bg-gray-50 mb-4">
                      {messages.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">Start a conversation with the AI mediator to get personalized advice and clarifications.</p>
                      ) : (
                        <div className="space-y-4">
                          {messages.map((message, index) => (
                            <div key={index} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                message.sender === 'user' 
                                  ? 'bg-indigo-600 text-white' 
                                  : 'bg-white text-gray-800 border'
                              }`}>
                                <p>{message.content}</p>
                                <p className={`text-xs mt-1 ${message.sender === 'user' ? 'text-indigo-200' : 'text-gray-500'}`}>
                                  {new Date(message.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                        placeholder="Ask the AI mediator about your dispute..."
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-gray-900"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={loading || !newMessage.trim()}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                      >
                        {loading ? <Loader className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="bg-white rounded-xl shadow-lg p-8 text-center">
                  <Scale className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Select a dispute from the Track tab to begin AI mediation.</p>
                </div>
              )}
            </div>
            
            {/* Sidebar */}
            <div className="space-y-6">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">How AI Mediation Works</h3>
                <div className="space-y-3 text-sm text-gray-600">
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                    <p>AI analyzes your dispute details and evidence</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                    <p>Provides objective legal analysis and precedents</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                    <p>Suggests fair settlement options</p>
                  </div>
                  <div className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                    <p>Available 24/7 for questions and clarifications</p>
                  </div>
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Platform Statistics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Disputes</span>
                    <span className="font-semibold text-green-600">{disputes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Resolved</span>
                    <span className="font-semibold text-green-600">
                      {disputes.filter(d => d.status === 'resolved').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Success Rate</span>
                    <span className="font-semibold text-green-600">
                      {disputes.length > 0 ? Math.round((disputes.filter(d => d.status === 'resolved').length / disputes.length) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;