import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { OpenBooksProvider } from './contexts/OpenBooksContext';
import { KeybindingsProvider } from './contexts/KeybindingsContext';
import { Layout } from './components/Layout/Layout';
import { LibraryPage } from './pages/Library/LibraryPage';
import { NotesPage } from './pages/Notes/NotesPage';
import { EditorPage } from './pages/Editor/EditorPage';
import { ViewPage } from './pages/View/ViewPage';
import { FlowchartsPage } from './pages/Flowcharts/FlowchartsPage';
import { FlowchartEditorPage } from './pages/FlowchartEditor/FlowchartEditorPage';
import { PdfViewerPage } from './pages/PdfViewer/PdfViewerPage';
import { SummaryPage } from './pages/Summary/SummaryPage';
import { QuestionsPage } from './pages/Questions/QuestionsPage';
import './monolith-theme.css';
import './global.css';

export default function App() {
  return (
    <ThemeProvider>
      <KeybindingsProvider>
      <BrowserRouter>
        <OpenBooksProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/notes" element={<NotesPage />} />
            <Route path="/flowcharts" element={<FlowchartsPage />} />
            <Route path="/flowcharts/:id/edit" element={<FlowchartEditorPage />} />
            <Route path="/questions" element={<QuestionsPage />} />
            <Route path="/summary" element={<SummaryPage />} />
            <Route path="/pdf/:attachmentId" element={<PdfViewerPage />} />
            <Route path="/view/:attachmentId" element={<PdfViewerPage />} />
            <Route path="/note/new" element={<EditorPage />} />
            <Route path="/note/:id/edit" element={<EditorPage />} />
            <Route path="/note/:id" element={<ViewPage />} />
          </Routes>
        </Layout>
        </OpenBooksProvider>
      </BrowserRouter>
      </KeybindingsProvider>
    </ThemeProvider>
  );
}
