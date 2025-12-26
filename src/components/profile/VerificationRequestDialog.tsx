import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BadgeCheck, Loader2, Upload } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface VerificationRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const categories = [
  { value: 'creator', label: 'Content Creator' },
  { value: 'business', label: 'Business/Brand' },
  { value: 'news', label: 'News/Media' },
  { value: 'government', label: 'Government/Politics' },
  { value: 'other', label: 'Other' },
];

export function VerificationRequestDialog({ open, onOpenChange }: VerificationRequestDialogProps) {
  const { user, profile } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: profile?.display_name || '',
    knownAs: '',
    category: '',
    bioLink: '',
    additionalInfo: '',
  });
  const [idDocument, setIdDocument] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.fullName || !formData.category) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);

    try {
      let idDocumentUrl = null;

      // Upload ID document if provided
      if (idDocument) {
        const fileName = `verification/${user.id}/${Date.now()}-${idDocument.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(fileName, idDocument);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('message-attachments')
          .getPublicUrl(uploadData.path);

        idDocumentUrl = urlData.publicUrl;
      }

      // Create verification request
      const { error } = await supabase
        .from('verification_requests')
        .insert({
          user_id: user.id,
          full_name: formData.fullName,
          known_as: formData.knownAs || null,
          category: formData.category,
          bio_link: formData.bioLink || null,
          id_document_url: idDocumentUrl,
          additional_info: formData.additionalInfo || null,
        });

      if (error) throw error;

      toast.success('Verification request submitted successfully');
      onOpenChange(false);
      
      // Reset form
      setFormData({
        fullName: profile?.display_name || '',
        knownAs: '',
        category: '',
        bioLink: '',
        additionalInfo: '',
      });
      setIdDocument(null);
    } catch (error: any) {
      console.error('Error submitting verification request:', error);
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BadgeCheck className="h-5 w-5 text-primary" />
            Request Verification
          </DialogTitle>
          <DialogDescription>
            Submit a request to get a verified badge on your profile. This helps others know your account is authentic.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full Name *</Label>
            <Input
              id="fullName"
              value={formData.fullName}
              onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
              placeholder="Your legal full name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="knownAs">Known As (Optional)</Label>
            <Input
              id="knownAs"
              value={formData.knownAs}
              onChange={(e) => setFormData({ ...formData, knownAs: e.target.value })}
              placeholder="Stage name, brand name, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bioLink">Link to prove identity (Optional)</Label>
            <Input
              id="bioLink"
              type="url"
              value={formData.bioLink}
              onChange={(e) => setFormData({ ...formData, bioLink: e.target.value })}
              placeholder="Wikipedia, news article, official website, etc."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="idDocument">ID Document (Optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="idDocument"
                type="file"
                accept="image/*,.pdf"
                onChange={(e) => setIdDocument(e.target.files?.[0] || null)}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => document.getElementById('idDocument')?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {idDocument ? idDocument.name : 'Upload ID Document'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Government-issued ID helps verify your identity
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additionalInfo">Additional Information (Optional)</Label>
            <Textarea
              id="additionalInfo"
              value={formData.additionalInfo}
              onChange={(e) => setFormData({ ...formData, additionalInfo: e.target.value })}
              placeholder="Why should we verify your account?"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Submit Request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
