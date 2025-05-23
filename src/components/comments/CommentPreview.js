import { useState, useCallback } from "react";
import useAxiosPrivate from "../../hooks/useAxiosPrivate";
import Loader from "../messages/Loader";
import FilePreview from "../posts/FilePreview";
import PreviewModal from "../posts/PreviewModal";
import { BACKEND_URL } from "../../api/axios";
import useFileTypeCheck from "../../hooks/useFileTypeCheck";
import useSocketEvent from "../../hooks/useSocketEvent";
import AddCommentForm from "../forms/AddCommentForm";
import "./CommentPreview.css";
import { Link } from "react-router-dom";
import useFormatDate from "../../hooks/useFormatDate";

const CommentPreview = ({ comment, socket }) => {
  const axiosPrivate = useAxiosPrivate();
  const { isImage } = useFileTypeCheck();

  const [replies, setReplies] = useState([]);
  const [hasMoreReplies, setHasMoreReplies] = useState(true);
  const [isRepliesVisible, setIsRepliesVisible] = useState(false);
  const [repliesErr, setRepliesErr] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const formatDate = useFormatDate();

  const isParentComment = comment.commentId === null;

  const fetchReplies = useCallback(async () => {
    if (!hasMoreReplies || isLoadingReplies) return;

    setIsLoadingReplies(true);
    setRepliesErr(null);

    try {
      const lastTimestamp =
        replies.length > 0 ? replies[replies.length - 1].createdAt : null;
      const params = lastTimestamp ? { timestamp: lastTimestamp } : {};

      const response = await axiosPrivate.get(
        `/comments/${comment.id}/replies`,
        { params }
      );
      const newReplies = response.data.replies || [];
      const pagination = response.data.pagination || {};

      setReplies((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const uniqueNewReplies = newReplies.filter(
          (r) => !existingIds.has(r.id)
        );
        return [...prev, ...uniqueNewReplies];
      });

      if (!pagination.hasMore || newReplies.length === 0) {
        setHasMoreReplies(false);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.code === "ERR_CANCELED") return;
      setRepliesErr("Błąd ładowania odpowiedzi");
    } finally {
      setIsLoadingReplies(false);
    }
  }, [axiosPrivate, comment.id, replies, hasMoreReplies, isLoadingReplies]);

  const toggleReplies = () => {
    if(!isRepliesVisible && replies.length === 0){
      setReplies([]);
      setHasMoreReplies(true);
      fetchReplies();
    }
    setIsRepliesVisible((v) => !v);
  };

  useSocketEvent(
    "newComment",
    (newComment) => {
      if (
        isParentComment &&
        newComment.commentId === comment.id
      ) {
        setReplies((prev) => {
          if(prev.some((r) => r.id === newComment.id)){
            return prev;
          }
          return [newComment, ...prev];
        });
      }
    },
    socket
  );

  const imageFiles = comment.files?.filter((file) => isImage(file.filename)) || [];
  const otherFiles = comment.files?.filter((file) => !isImage(file.filename)) || [];

  const closePreview = () => setPreviewFile(null);

  const handleReplyAdded = (newReply) => {
    setReplies((prev) => {
      if (prev.some((r) => r.id === newReply.id)) return prev;
      return [newReply, ...prev];
    });
    setIsReplying(false);
    setHasMoreReplies(true);
  };
  
  const authorAvatar = comment?.users?.files[0]?.filename;

  return (
    <div className={`comment-preview ${!isParentComment ? "child-comment" : ""}`}>
      <div className="comment-preview-header">
        <div className="comment-preview-avatar">
          <Link to={`/users/${comment.users.username}`} className='comment-preview-link'>
            {authorAvatar == null ? 
              comment.users.username?.[0].toUpperCase()
              : (
              <img src={`${BACKEND_URL}/static/${authorAvatar}`} className='comment-preview-avatar-img' alt='author avatar'/>
            )}
          </Link>
        </div>
        <div className="comment-preview-userinfo">
          <strong className="comment-preview-username">
            <Link to={`/users/${comment.users.username}`} className='comment-preview-link'>
              {`${comment?.users.name} ${comment.users.surname}`}
            </Link>
          </strong>
          <div className="comment-preview-date">{formatDate(comment.createdAt)}</div>
        </div>
      </div>
      <div className="comment-content">
        <p>{comment.content}</p>
        {/* <div className="comment-meta">
          <small>{formatDate(comment.createdAt)}</small>
        </div> */}

        {imageFiles.length > 0 && (
          <div className="comment-image-files">
            {imageFiles.map((file) => (
              <img
                key={file.id || file.filename}
                src={`${BACKEND_URL}/static/${file.filename}`}
                alt={file.filename}
                className="comment-image-file"
                onClick={() =>
                  setPreviewFile({
                    type: "image",
                    url: `${BACKEND_URL}/static/${file.filename}`,
                  })
                }
              />
            ))}
          </div>
        )}

        {otherFiles.length > 0 && (
          <div className="comment-other-files">
            {otherFiles.map((file) => (
              <FilePreview
                key={file.id || file.filename}
                file={file}
                onPreview={setPreviewFile}
              />
            ))}
          </div>
        )}
      </div>

      {isParentComment && (
        <div className="comment-buttons">
          <button onClick={toggleReplies} className="toggle-replies-btn">
            {isRepliesVisible ? "Ukryj odpowiedzi" : "Pokaż odpowiedzi"}
          </button>

          <button
            onClick={() => setIsReplying((v) => !v)}
            className="reply-btn"
          >
            {isReplying ? "Anuluj" : "Odpowiedz"}
          </button>
        </div>
      )}

      {isReplying && isParentComment && (
        <div className={`reply-form-container ${!isParentComment ? "child-comment" : ""}`}>
          <AddCommentForm
            postId={comment.postId}
            parentCommentId={comment.id}
            onCommentAdded={handleReplyAdded}
          />
        </div>
      )}

      {isParentComment && isRepliesVisible && (
        <div className="replies-list">
          {replies.length === 0 && !isLoadingReplies && <p>Brak odpowiedzi</p>}

          <ul>
            {replies.map((reply) => (
              <li key={reply.id} style={{ listStyleType: "none" }}>
                <CommentPreview comment={reply} socket={socket} />
              </li>
            ))}
          </ul>

          {repliesErr && <p style={{ color: "red" }}>{repliesErr}</p>}
          {isLoadingReplies && <Loader />}

          {!isLoadingReplies && hasMoreReplies && (
            <button onClick={fetchReplies} className="load-more-replies-btn">
              Załaduj więcej odpowiedzi
            </button>
          )}

          {!hasMoreReplies && replies.length > 0 && (
            <p>To już wszystkie odpowiedzi.</p>
          )}
        </div>
      )}

      <PreviewModal previewFile={previewFile} onClose={closePreview} />
    </div>
  );
};

export default CommentPreview;
